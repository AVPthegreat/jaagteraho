// Blocked hostile traffic (16 Nov 2026: a scanner sent 2,734 requests for /.env, /api/credentials and
// the like to the server's raw EC2 hostname; Django refused them all with DisallowedHost, and 12 of the
// ~33 per-path incidents rang the owner at 2:40 am). Both sides are tested: the scan folds into one
// quiet burst, and real errors (own host, signed-in user, any crash) still go the normal way.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AI } from "../src/ai/claude.js";
import { openDb, setSettings } from "../src/db/db.js";
import { allowlistEvent, type CleanEvent } from "../src/intake/allowlist.js";
import { classifyScan, isSecretProbe } from "../src/intake/scan.js";
import { storeEvent } from "../src/intake/store.js";
import { applyRules, decide, tally, type Answer, type Facts } from "../src/pipeline/decide.js";
import { Worker } from "../src/pipeline/worker.js";
import { buildDigest } from "../src/telegram/digest.js";
import type { Telegram } from "../src/telegram/api.js";

const EC2 = "ec2-13-235-154-100.ap-south-1.compute.amazonaws.com";
const hostMsg = (host: string) => `Invalid HTTP_HOST header: '${host}'. You may need to add '${host}' to ALLOWED_HOSTS.`;
let n = 0;
const ev = (p: Partial<CleanEvent> = {}): CleanEvent => ({
  event_id: (++n).toString(16).padStart(32, "0"),
  timestamp: new Date().toISOString(),
  level: "error",
  platform: "python",
  release: "r1",
  environment: "production",
  transaction: "/.env",
  exception_type: "DisallowedHost",
  message: hostMsg(EC2),
  chain: [],
  frames: [],
  tags: {},
  sdk: "sentry.python.django 2.71.0",
  ...p,
});

const PROBES = ["/.env", "/api/credentials", "/api/keys", "/api/v1/namespaces/default/secrets", "/graphql", "/swagger.json", "/.git/config", "/wp-admin/setup.php", "/actuator/env", "/phpmyadmin/"];

function setup(settings: Record<string, unknown> = {}) {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, name, public_key, kind, settings, created_at) VALUES (1, 'faurus', 'k', 'faurus', ?, ?)").run(JSON.stringify(settings), new Date().toISOString());
  db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (1, 42, 7, ?)").run(new Date().toISOString());
  return db;
}

describe("classifyScan", () => {
  it("a DisallowedHost for the raw EC2 hostname, no user, is a refused-host scan", () => {
    assert.equal(classifyScan(ev())?.kind, "refused_host");
    assert.equal(classifyScan(ev({ exception_type: "django.core.exceptions.DisallowedHost", transaction: "/about" }))?.kind, "refused_host");
    assert.equal(classifyScan(ev({ message: hostMsg("[ip]") }))?.kind, "refused_host");
    assert.equal(classifyScan(ev({ message: hostMsg("13.235.154.100:80") }))?.kind, "refused_host");
    // Sentry's logging integration may send it as a message event from django.security.DisallowedHost.
    assert.equal(classifyScan(ev({ exception_type: "Message" }))?.kind, "refused_host");
  });
  it("a refused secret probe (404, SuspiciousOperation) with no user is a probe scan", () => {
    assert.equal(classifyScan(ev({ exception_type: "Http404", message: "not found", transaction: "/api/credentials" }))?.kind, "secret_probe");
    assert.equal(classifyScan(ev({ exception_type: "SuspiciousFileOperation", message: "x", transaction: "GET /.git/config" }))?.kind, "secret_probe");
    for (const p of PROBES) assert.ok(isSecretProbe(p), p);
    for (const p of ["/api/submission", "/keyboard", "/api/token/refresh", "/about", "/api/problem/two-sum"]) assert.ok(!isSecretProbe(p), p);
  });
  it("never folds a real error: a crash, a signed-in user, the real domain, or an ordinary 404", () => {
    // A crash on a probe path is a 5xx: the app failed, so it goes the normal way.
    assert.equal(classifyScan(ev({ exception_type: "KeyError", message: "'x'", transaction: "/.env" })), null);
    assert.equal(classifyScan(ev({ exception_type: "OperationalError", message: "db down", transaction: "/api/keys" })), null);
    assert.equal(classifyScan(ev({ signed_in: true })), null);
    assert.equal(classifyScan(ev({ level: "fatal" })), null);
    // The app's own host refused means its ALLOWED_HOSTS is wrong: every visitor is blocked.
    assert.equal(classifyScan(ev({ message: hostMsg("code.faurus.app"), transaction: "/api/submission" }), ["code.faurus.app"]), null);
    assert.equal(classifyScan(ev({ message: hostMsg("admin.faurus.app"), transaction: "/.env" }), [".faurus.app"]), null);
    // An unknown domain with no host list: only a secret probe is folded.
    assert.equal(classifyScan(ev({ message: hostMsg("faurus.example"), transaction: "/api/submission" })), null);
    assert.equal(classifyScan(ev({ message: hostMsg("faurus.example"), transaction: "/.env" }))?.kind, "secret_probe");
    // With a host list, any other host is stray.
    assert.equal(classifyScan(ev({ message: hostMsg("evil.example"), transaction: "/" }), ["code.faurus.app"])?.kind, "refused_host");
    assert.equal(classifyScan(ev({ exception_type: "Http404", message: "nf", transaction: "/about" })), null);
  });
  it("allowlist marks signed-in users by id, email or username, not by IP address", () => {
    const base = { event_id: "a".repeat(32), exception: { values: [{ type: "DisallowedHost", value: hostMsg(EC2) }] }, transaction: "/.env" };
    assert.equal(allowlistEvent({ ...base, user: { ip_address: "1.2.3.4" } })?.signed_in, false);
    assert.equal(allowlistEvent({ ...base, user: { id: "{{auto}}" } })?.signed_in, false);
    assert.equal(allowlistEvent(base)?.signed_in, false);
    assert.equal(allowlistEvent({ ...base, user: { id: 17 } })?.signed_in, true);
    // The IP never survives: only a one-way hash, and the address is not in any stored field.
    const clean = allowlistEvent({ ...base, user: { ip_address: "1.2.3.4" } })!;
    assert.ok(!JSON.stringify(clean).includes("1.2.3.4"));
  });
});

describe("burst grouping", () => {
  it("2,000 refused probes over 33 paths in 2 minutes make one incident and one job", () => {
    const db = setup();
    const t0 = Date.parse("2026-11-16T21:11:00Z");
    for (let i = 0; i < 2000; i++) {
      const path = i % 33 < PROBES.length ? PROBES[i % 33] : `/probe/secrets-${i % 33}`;
      const r = storeEvent(db, 1, ev({ transaction: path, tags: { jr_user: `src${i % 2}` } }), new Date(t0 + i * 60));
      assert.ok(r.stored);
    }
    const incidents = db.prepare("SELECT fingerprint, exception_type, hits FROM incidents").all() as Array<{ fingerprint: string; exception_type: string; hits: number }>;
    assert.equal(incidents.length, 1);
    assert.match(incidents[0].fingerprint, /^scan:1:2026-11-16T21:11:00/);
    assert.equal(incidents[0].exception_type, "Blocked scan");
    assert.equal(incidents[0].hits, 2000);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n, 1);
  });
  it("a gap of more than 10 minutes starts a new burst; real errors keep their own incidents", () => {
    const db = setup();
    const t0 = Date.parse("2026-11-16T21:11:00Z");
    storeEvent(db, 1, ev(), new Date(t0));
    storeEvent(db, 1, ev({ transaction: "/api/keys" }), new Date(t0 + 9 * 60_000));
    storeEvent(db, 1, ev(), new Date(t0 + 20 * 60_000));
    const real = storeEvent(db, 1, ev({ exception_type: "KeyError", message: "'language'", transaction: "/api/submission" }), new Date(t0 + 60_000));
    assert.ok(real.stored && real.change === "new");
    const fps = (db.prepare("SELECT fingerprint FROM incidents ORDER BY id").all() as Array<{ fingerprint: string }>).map((r) => r.fingerprint);
    assert.equal(fps.filter((f) => f.startsWith("scan:")).length, 2);
    assert.equal(fps.filter((f) => !f.startsWith("scan:")).length, 1);
  });
});

const ans = (p: Partial<Answer>): Answer => ({ is_noise: "no", severity: "3", category: "unknown", user_blocked: "yes", suggested_action: "notify", ...p });
const base: Facts = { critical: null, exam_open: false, owner_away: false, hits_10m: 1, users_1h: 0, change: "new", learn_mode: false, backlog: false };

describe("rule 12", () => {
  it("a blocked scan is logged whatever the votes say, and many sources do not make it rule 10", () => {
    const blocks = tally(Array(5).fill(ans({ severity: "4", user_blocked: "yes" })));
    const r = applyRules({ ...base, security_noise: true, users_1h: 40, critical: "api" }, blocks, false);
    assert.equal(r.action, "log");
    assert.equal(r.rule, 12);
    assert.equal(applyRules({ ...base, security_noise: true }, {}, true).rule, 12);
    // Learn mode still comes first; without the fact, the same votes notify (rule 7) as before.
    assert.equal(applyRules({ ...base, security_noise: true, learn_mode: true }, blocks, false).rule, 1);
    assert.equal(applyRules(base, tally([ans({ severity: "3" })]), false).rule, 7);
  });
  it("decide never asks the model about a scan, but still asks about a real DisallowedHost on the app's own host", async () => {
    const db = setup({ hosts: ["code.faurus.app"] });
    let calls = 0;
    const ai = {
      client: { messages: { parse: async () => (calls++, { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: ans({}) }) } },
      guard: { pick: (m: string) => m, record: () => undefined },
      decisionModel: "m",
    } as unknown as AI;
    const ctxFor = (e: CleanEvent) => {
      const r = storeEvent(db, 1, e);
      assert.ok(r.stored);
      return { incidentId: r.incidentId, projectId: 1, projectName: "faurus", change: "new" as const, status: "open", hits: 1, event: { ...e } };
    };
    const scan = await decide(db, ai, ctxFor(ev()), false);
    assert.equal(scan.action, "log");
    assert.equal(scan.rule, 12);
    assert.equal(scan.engine, "rules-only");
    assert.equal(calls, 0);

    const own = await decide(db, ai, ctxFor(ev({ message: hostMsg("code.faurus.app"), transaction: "/api/submission" })), false);
    assert.equal(own.action, "notify");
    assert.equal(own.rule, 7);
    assert.equal(calls, 5);
  });
});

function fakeTelegram() {
  const sent: Array<{ text: string; quiet: boolean }> = [];
  const tg = {
    send: async (_c: number, text: string, _m?: unknown, opts: { quiet?: boolean } = {}) => (sent.push({ text, quiet: !!opts.quiet }), { message_id: 1, chat: { id: 42, type: "private" } }),
  } as unknown as Telegram;
  return { tg, sent };
}

describe("one quiet summary per burst", () => {
  it("sends one silent message after the scan ends, with counts by path, and never repeats it", async () => {
    const db = setup();
    const t0 = Date.parse("2026-11-16T21:11:00Z");
    for (let i = 0; i < 120; i++) storeEvent(db, 1, ev({ transaction: PROBES[i % 3], tags: { jr_user: "abc123" } }), new Date(t0 + i * 1000));
    const { tg, sent } = fakeTelegram();
    const w = new Worker(db, null, tg, null);
    assert.equal(await w.scanSummaries(t0 + 5 * 60_000), 0, "not while the scan is still going");
    assert.equal(await w.scanSummaries(t0 + 15 * 60_000), 1);
    assert.equal(await w.scanSummaries(t0 + 16 * 60_000), 0, "never twice");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].quiet, true);
    const text = sent[0].text;
    assert.match(text, /Blocked scan on faurus/);
    assert.match(text, /120 hostile requests/);
    assert.match(text, /DisallowedHost ×120/);
    assert.match(text, /\/\.env ×40/);
    assert.match(text, /No action needed/);
    assert.match(text, /Host headers at nginx/);
    assert.match(text, /Sources: 1 \(hashed/);
    assert.ok(!text.includes("13.235.154.100"));
  });
  it("a small burst gets no message, only a line in the 08:00 summary", async () => {
    const db = setup();
    const t0 = Date.parse("2026-11-16T21:11:00Z");
    for (let i = 0; i < 5; i++) storeEvent(db, 1, ev(), new Date(t0 + i * 1000));
    const { tg, sent } = fakeTelegram();
    assert.equal(await new Worker(db, null, tg, null).scanSummaries(t0 + 60 * 60_000), 0);
    assert.equal(sent.length, 0);
    const digest = buildDigest(db, [1], new Date(t0 - 1000).toISOString())!;
    assert.match(digest, /1 blocked scan: 5 hostile requests, all refused by the app\. No action needed\./);
  });
});
