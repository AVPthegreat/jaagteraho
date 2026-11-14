// Security review fixes before the HackGlobal submission (14 Nov 2026): body limits, rate limits,
// quotas per purpose, voice reuse, demo phone switch, timestamps, self-watch owner, sandbox runner, owner page.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { dailyCaps, SpendGuard, spendContext } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { allowlistEvent, toIso } from "../src/intake/allowlist.js";
import { intakeRoutes } from "../src/intake/route.js";
import { logRoutes } from "../src/intake/logs.js";
import { CONNECT_RESERVE, createOutsideApp, createOutsideAppIfRoom, NEW_APPS_PER_DAY } from "../src/projects.js";
import { DAILY_DIAGNOSES, laneFor } from "../src/pipeline/worker.js";
import { RUNNER, riskyFixLines } from "../src/pipeline/verify.js";
import { adminChatId, ensureSelfProject } from "../src/selfwatch.js";
import { StoredVoice } from "../src/voice/voice.js";
import { bodyLimits, Slots, Window } from "../src/web/limits.js";
import { netOf } from "../src/web/connect.js";
import { OWNER_CSP, ownerRoutes } from "../src/web/owner.js";
import { PER_DAY, PER_VISITOR_PER_DAY, reservePaste } from "../src/web/paste.js";
import { FEEDS_PER_IP, publicRoutes } from "../src/web/public.js";

const json = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`http://x${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

/** A body sent in chunks with no Content-Length, like a client that streams. */
function streamed(path: string, bytes: number, headers: Record<string, string> = {}) {
  let left = bytes;
  const chunk = new Uint8Array(64 * 1024).fill(97);
  const body = new ReadableStream<Uint8Array>({
    pull(ctl) {
      if (left <= 0) return ctl.close();
      const n = Math.min(left, chunk.length);
      left -= n;
      ctl.enqueue(chunk.subarray(0, n));
    },
  });
  return new Request(`http://x${path}`, { method: "POST", headers, body, duplex: "half" } as RequestInit);
}

describe("body size limits", () => {
  const db = openDb(":memory:");
  const app = new Hono();
  app.use("*", bodyLimits());
  app.route("/", publicRoutes({ db, voice: null, twinBroken: "http://127.0.0.1:9", twinFixed: "http://127.0.0.1:9", allowedOrigins: [] }));
  app.route("/", intakeRoutes({ db }));
  app.route("/", logRoutes(db));
  app.post("/echo", async (c) => c.json({ n: (await c.req.text()).length }));

  it("refuses a public JSON body over 256 KB, with or without a Content-Length", async () => {
    const big = JSON.stringify({ session: "aaaaaaaaaa", name: "x".repeat(300 * 1024), country: "IN" });
    assert.equal((await app.request(json("/public/sign", big))).status, 413);
    assert.equal((await app.request(streamed("/public/sign", 300 * 1024, { "content-type": "application/json" }))).status, 413);
    assert.equal((await app.request(streamed("/echo", 200 * 1024))).status, 200, "under the limit still works");
  });

  it("the envelope intake stops a streamed body at its own 200 KB, before reading it all", async () => {
    const r = await app.request(streamed("/api/123456/envelope/?sentry_key=k", 230 * 1024));
    assert.equal(r.status, 413);
  });

  it("log drains get 1 MB, not 256 KB", async () => {
    assert.notEqual((await app.request(streamed("/logs/1/k", 600 * 1024, { "content-type": "text/plain" }))).status, 413);
    assert.equal((await app.request(streamed("/logs/1/k", 1100 * 1024, { "content-type": "text/plain" }))).status, 413);
  });
});

describe("rate limits", () => {
  it("Window forgets keys whose window has passed and never grows past its cap", () => {
    const w = new Window(100);
    const t0 = 1_000_000;
    for (let i = 0; i < 99; i++) assert.ok(w.allow(`k${i}`, 1, 1_000, t0));
    assert.equal(w.allow("k0", 1, 1_000, t0 + 10), false);
    w.prune(t0 + 2_000);
    assert.equal(w.size, 0);
    for (let i = 0; i < 1_000; i++) w.allow(`x${i}`, 5, 60_000, t0 + 3_000);
    assert.ok(w.size <= 100, `size ${w.size}`);
  });

  it("allowAll records nothing when one of the limits refuses", () => {
    const w = new Window();
    assert.ok(w.allowAll([["ip", 3, 60_000], ["s", 1, 60_000]]));
    for (let i = 0; i < 5; i++) assert.equal(w.allowAll([["ip", 3, 60_000], ["s", 1, 60_000]]), false);
    assert.ok(w.allowAll([["ip", 3, 60_000], ["s2", 1, 60_000]]), "the refused session did not use up the address");
    assert.ok(w.allowAll([["ip", 3, 60_000], ["s3", 1, 60_000]]));
    assert.equal(w.allowAll([["ip", 3, 60_000], ["s4", 1, 60_000]]), false);
  });

  it("Slots caps open connections per key and in total", () => {
    const s = new Slots(2, 3);
    assert.ok(s.take("a") && s.take("a"));
    assert.equal(s.take("a"), false);
    assert.ok(s.take("b"));
    assert.equal(s.take("c"), false, "server-wide cap");
    s.release("a");
    assert.ok(s.take("c"));
    s.release("zz"); // releasing what was never taken changes nothing
    assert.equal(s.count, 3);
  });

  const db = openDb(":memory:");
  const pub = publicRoutes({ db, voice: null, twinBroken: "http://127.0.0.1:9", twinFixed: "http://127.0.0.1:9", allowedOrigins: [] });

  it("limits the logbook signature per session and per address", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await pub.request(json("/public/sign", JSON.stringify({ session: "sign-session-1", name: "a", country: "IN" }), { "x-forwarded-for": "9.9.9.1" }))).status);
    assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.equal(codes[5], 429);
    const ipCodes: number[] = [];
    for (let i = 0; i < 35; i++) ipCodes.push((await pub.request(json("/public/sign", JSON.stringify({ session: `sign-s-${i}-xxxx`, name: "a", country: "IN" }), { "x-forwarded-for": "9.9.9.2" }))).status);
    assert.equal(ipCodes.filter((c) => c === 429).length, 5, "30 an hour from one address, whatever the session");
  });

  it("limits approve per session", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) codes.push((await pub.request(json("/public/approve", JSON.stringify({ session: "appr-session-1", flow: "submit", fix_id: 1 }), { "x-forwarded-for": "9.9.9.3" }))).status);
    assert.equal(codes.filter((c) => c === 409).length, 20);
    assert.equal(codes.filter((c) => c === 429).length, 2);
  });

  it("caps live feeds per address", async () => {
    const open: Response[] = [];
    for (let i = 0; i < FEEDS_PER_IP; i++) {
      const r = await pub.request(`/public/feed/feed-session-${i}`, { headers: { "x-forwarded-for": "9.9.9.4" } });
      assert.equal(r.status, 200);
      open.push(r);
    }
    assert.equal((await pub.request("/public/feed/feed-session-x", { headers: { "x-forwarded-for": "9.9.9.4" } })).status, 429);
    assert.equal((await pub.request("/public/feed/feed-session-y", { headers: { "x-forwarded-for": "9.9.9.5" } })).status, 200, "another address is fine");
    for (const r of open) await r.body?.cancel();
  });

  it("groups addresses by network block", () => {
    assert.equal(netOf("203.0.113.7"), "203.0.113");
    assert.equal(netOf("2001:db8:abcd:1::5"), "2001:db8:abcd");
  });
});

describe("quotas per purpose", () => {
  it("paste slots are reserved atomically: the limits hold even before any diagnosis finishes", () => {
    const db = openDb(":memory:");
    db.exec("CREATE TABLE IF NOT EXISTS pastes (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, repo TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT NOT NULL)");
    const got = Array.from({ length: PER_VISITOR_PER_DAY + 2 }, () => reservePaste(db, "same-session", "a/b"));
    assert.equal(got.filter((g) => typeof g === "object").length, PER_VISITOR_PER_DAY);
    assert.equal(got.at(-1), "visitor");
    let ok = PER_VISITOR_PER_DAY;
    for (let i = 0; ok < PER_DAY + 5; i++) {
      const g = reservePaste(db, `s-${i}`, "a/b");
      if (g === "day") break;
      ok++;
    }
    assert.equal(ok, PER_DAY);
  });

  it("new apps: the count and the insert are one step, and Telegram cannot take Connect's reserve", () => {
    const db = openDb(":memory:");
    let tg = 0;
    while (createOutsideAppIfRoom(db, "telegram", `t${tg}`, null)) tg++;
    assert.equal(tg, NEW_APPS_PER_DAY - CONNECT_RESERVE);
    let web = 0;
    while (createOutsideAppIfRoom(db, "connect", `w${web}`, null)) web++;
    assert.equal(web, CONNECT_RESERVE);
  });

  it("each lane has its own daily budget, and the daily cap stops spending before the all-time stop", () => {
    const db = openDb(":memory:");
    const caps = { ...dailyCaps({}), total: 10, paste: 0.5, demo: 3 };
    const guard = new SpendGuard(db, 40, 45, caps);
    const inLane = <T>(lane: "paste" | "demo" | "faurus" | "outside", f: () => T) => spendContext.run({ projectId: 0, lane }, f);
    // $0.6 of paste spend: paste stops, Faurus and the demo carry on.
    inLane("paste", () => guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 300_000, output_tokens: 0 }));
    assert.equal(inLane("paste", () => guard.pick("claude-sonnet-5-5", "claude-haiku-5-5")), null);
    assert.equal(inLane("faurus", () => guard.pick("claude-sonnet-5-5", "claude-haiku-5-5")), "claude-sonnet-5-5");
    assert.equal(guard.pick("claude-sonnet-5-5", "claude-haiku-5-5"), "claude-sonnet-5-5", "no context counts as our own");
    assert.equal(guard.countToday("diagnosis", "paste"), 1);
    assert.equal(guard.countToday("diagnosis", "faurus"), 0);
    // $10 in a day across lanes stops everything, far below the $45 all-time stop.
    inLane("faurus", () => guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 4_800_000, output_tokens: 0 }));
    assert.ok(guard.spentToday() >= 10);
    assert.equal(inLane("faurus", () => guard.pick("claude-sonnet-5-5", "claude-haiku-5-5")), null);
    // Rows older than a day do not count toward the daily caps.
    db.prepare("UPDATE spend SET at = ?").run(new Date(Date.now() - 25 * 3_600_000).toISOString());
    assert.equal(inLane("paste", () => guard.pick("claude-sonnet-5-5", "claude-haiku-5-5")), "claude-sonnet-5-5");
  });

  it("apps map to lanes, and outside apps get fewer diagnoses than Faurus", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (1, 'demo', 'k', 'sandbox', NULL, 'read', '{}', ?), (2, 'faurus', 'k2', 'faurus', NULL, 'read', '{}', ?)").run(new Date().toISOString(), new Date().toISOString());
    const outside = createOutsideApp(db, "shop", null);
    assert.equal(laneFor(db, 1), "demo");
    assert.equal(laneFor(db, 2), "faurus");
    assert.equal(laneFor(db, outside.id), "outside");
    assert.ok(DAILY_DIAGNOSES.outside < DAILY_DIAGNOSES.faurus);
  });
});

describe("voice notes", () => {
  class FakeVoice extends StoredVoice {
    made = 0;
    protected async synthesize() {
      this.made++;
      return Buffer.from("wav");
    }
    protected async encode(): Promise<[Buffer, Buffer | null]> {
      return [Buffer.from("ogg"), Buffer.from("mp3")];
    }
  }
  const info = { project: "demo", flow: "code submission", hits: 3, exam: true };

  it("one clip per incident per window, reused in between", async () => {
    const v = new FakeVoice(mkdtempSync(join(tmpdir(), "jr-voice-")));
    const a = await v.wakeCall(info, { key: "incident:1", reuseMs: 60_000 });
    const b = await v.wakeCall(info, { key: "incident:1", reuseMs: 60_000 });
    const c = await v.wakeCall(info, { key: "incident:2", reuseMs: 60_000 });
    assert.equal(a!.id, b!.id);
    assert.notEqual(a!.id, c!.id);
    assert.equal(v.made, 2);
    await v.wakeCall(info, { key: "incident:3", reuseMs: 0 });
    await v.wakeCall(info, { key: "incident:3", reuseMs: 0 });
    assert.equal(v.made, 4, "no window: no reuse");
  });

  it("keeps the newest clips and none older than the cut-off", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jr-voice-"));
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      const id = i.toString(16).padStart(16, "0");
      for (const ext of ["ogg", "mp3"]) {
        writeFileSync(join(dir, `${id}.${ext}`), "x");
        const t = (now - i * 3_600_000) / 1000; // clip i is i hours old
        utimesSync(join(dir, `${id}.${ext}`), t, t);
      }
    }
    writeFileSync(join(dir, "notes.txt"), "not a clip");
    const v = new FakeVoice(dir);
    assert.equal(await v.prune(now, 6, 3), 4);
    assert.equal(await v.prune(now, 100, 2.5 / 24), 3, "clips older than 2.5 hours go");
    assert.deepEqual(readdirSync(dir).sort(), ["0000000000000000.mp3", "0000000000000000.ogg", "0000000000000001.mp3", "0000000000000001.ogg", "0000000000000002.mp3", "0000000000000002.ogg", "notes.txt"]);
  });
});

describe("intake timestamps", () => {
  it("a timestamp outside JavaScript's date range falls back instead of throwing", () => {
    const fallback = new Date("2026-11-14T00:00:00Z");
    for (const ts of [1e20, -1e20, Infinity, NaN, "+999999-01-01", "not a date", null, {}]) assert.equal(toIso(ts, fallback), fallback.toISOString(), String(ts));
    assert.equal(toIso(1_700_000_000, fallback), new Date(1_700_000_000_000).toISOString());
    const ev = allowlistEvent({ message: "boom", timestamp: 1e20 }, fallback);
    assert.equal(ev?.timestamp, fallback.toISOString());
  });
});

describe("self-watch owner", () => {
  it("reads JR_ADMIN_CHAT_ID strictly", () => {
    assert.equal(adminChatId({}), null);
    assert.equal(adminChatId({ JR_ADMIN_CHAT_ID: "abc" }), null);
    assert.equal(adminChatId({ JR_ADMIN_CHAT_ID: "0" }), null);
    assert.equal(adminChatId({ JR_ADMIN_CHAT_ID: " 12345 " }), 12345);
  });

  it("never makes the first linked owner (maybe an outside developer) the owner of JaagteRaho's own alerts", () => {
    const before = process.env.JR_ADMIN_CHAT_ID;
    delete process.env.JR_ADMIN_CHAT_ID;
    try {
      const db = openDb(":memory:");
      const app = createOutsideApp(db, "stranger", null);
      db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, 555, 555, ?)").run(app.id, new Date().toISOString());
      const self = ensureSelfProject(db, "/app");
      assert.equal(db.prepare("SELECT 1 FROM owners WHERE project_id = ?").get(self), undefined);
      process.env.JR_ADMIN_CHAT_ID = "777";
      ensureSelfProject(db, "/app");
      assert.deepEqual(db.prepare("SELECT chat_id, user_id FROM owners WHERE project_id = ?").all(self), [{ chat_id: 777, user_id: 777 }]);
    } finally {
      if (before === undefined) delete process.env.JR_ADMIN_CHAT_ID;
      else process.env.JR_ADMIN_CHAT_ID = before;
    }
  });
});

describe("fix proof sandbox", () => {
  it("flags fixes that add io or xmlrpc", () => {
    assert.equal(riskyFixLines("", "x = io.open('/etc/passwd').read()").length, 1);
    assert.equal(riskyFixLines("", "import xmlrpc.client").length, 1);
    assert.equal(riskyFixLines("", "ratio = a / b").length, 0);
  });

  const run = (test: string) => {
    const dir = mkdtempSync(join(tmpdir(), "jr-runner-"));
    writeFileSync(join(dir, "jr_regression_test.py"), test);
    const r = spawnSync(process.env.JR_TEST_PYTHON ?? "python3", ["-E", "-s", "-c", RUNNER], { cwd: dir, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONDONTWRITEBYTECODE: "1" }, encoding: "utf8", timeout: 20_000 });
    return `${r.stdout}\n${r.stderr}`;
  };
  const wrap = (body: string) => `import unittest, os\nclass T(unittest.TestCase):\n    def test_a(self):\n        ${body}\n`;

  it("the test process cannot read another process's environment, even past the syntax check", () => {
    assert.match(run(wrap("open('/proc/1/environ').read()")), /PermissionError: not allowed in a regression test: \/proc\/1\/environ/);
    assert.match(run(wrap("os.listdir('/proc')")), /PermissionError/);
    assert.match(run(wrap("open('/tmp/../etc/jr-x', 'w')")), /not allowed in a regression test: writing/);
    assert.match(run(wrap("os.system('true')")), /not allowed in a regression test: os.system/);
  });

  it("Django-style setup that sets TZ still runs; a rename out of the copy is refused", () => {
    assert.match(run(wrap("os.environ['TZ'] = 'Asia/Kolkata'; self.assertEqual(os.environ['TZ'], 'Asia/Kolkata')")), /^OK/m);
    assert.match(run(wrap("open('a.txt', 'w').write('x'); os.rename('a.txt', '/var/tmp/jr-moved')")), /not allowed in a regression test: writing/);
  });

  it("an ordinary test still runs and can write inside its own folder", () => {
    const out = run(wrap("open('scratch.txt', 'w').write('ok'); self.assertEqual(1 + 1, 2)"));
    assert.match(out, /^OK/m);
  });
});

describe("owner page headers", () => {
  it("sends a CSP that forbids scripts and framing, on the page and the expired page", async () => {
    const r = await ownerRoutes(openDb(":memory:")).request("/owner/incident/1?e=1&s=x");
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("content-security-policy"), OWNER_CSP);
    assert.match(OWNER_CSP, /default-src 'none'/);
    assert.match(OWNER_CSP, /frame-ancestors 'none'/);
    assert.doesNotMatch(OWNER_CSP, /script-src/);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  });
});
