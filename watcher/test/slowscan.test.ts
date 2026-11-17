// Slow vulnerability scans in the access log (16-17 Nov 2026: 34.97.115.29, Google Cloud Osaka, ~11,000 requests
// over ~20 h at 500-2,000 an hour through Cloudflare, probing /.env, /key.pem, /docker-compose.yml, /.git, /@fs/...,
// /api/fs/read, GraphQL consoles; every answer the 5,859-byte index page or a 404, so no error reached us).
// Both sides are tested: the scan gives ONE quiet message per address per 6 hours, and ordinary student
// traffic, noids (internal addresses, our own servers) and real errors never trigger it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb, setSettings } from "../src/db/db.js";
import { logRoutes } from "../src/intake/logs.js";
import { isInternalIp, isSensitivePath, parseAccessLine, SlowScanDetector, type AccessLine } from "../src/intake/slowscan.js";
import { Worker } from "../src/pipeline/worker.js";
import type { Telegram } from "../src/telegram/api.js";
import { buildSlowScanSummary, ownerFromRdns } from "../src/telegram/digest.js";

const SCANNER = "34.97.115.29";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const T0 = Date.UTC(2026, 10, 16, 16, 41, 0); // 16 Nov 22:11 IST

function stamp(ms: number) {
  const d = new Date(ms);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${mon}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}
/** One line in Faurus's nginx `faurus_combined` format (same fields as "combined"). */
const line = (ip: string, ms: number, path: string, status: number, bytes: number, method = "GET", ua = UA) =>
  `${ip} - - [${stamp(ms)}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;

const PROBES = [
  "/.env", "/.env.production", "/key.pem", "/server.key", "/docker-compose.yml", "/docker-compose.prod.yaml", "/.git/config", "/.git/HEAD",
  "/@fs/etc/passwd", "/@fs/app/.env", "/api/fs/read?path=/etc/passwd", "/graphql/console", "/graphiql", "/backup.sql", "/db.sqlite3",
  "/proc/self/environ", "/wp-login.php", "/phpmyadmin/", "/actuator/env", "/.aws/credentials", "/config.json", "/dump.sql",
];

/** About 11,000 requests over 20 hours: two thirds probes answered with the index page, the rest random 404s. */
function scannerLines(hours = 20, perHour = 550, start = T0) {
  const out: string[] = [];
  for (let i = 0; i < hours * perHour; i++) {
    const t = start + Math.floor((i * 3_600_000) / perHour);
    if (i % 3 === 2) out.push(line(SCANNER, t, `/static/js/${(i * 7919).toString(36)}.js.map`, 404, 153));
    else out.push(line(SCANNER, t, PROBES[i % PROBES.length], 200, 5859));
  }
  return out;
}

/** An hour of ordinary student traffic plus noids: busy, some 404s, but no scan. */
function normalLines(start = T0) {
  const out: string[] = [];
  const pages = ["/", "/problems", "/problem/two-sum", "/api/problem?limit=20", "/api/submission?id=1", "/learn/sql/keys-and-joins", "/api/profile", "/contest/42", "/assets/vendor-3f9a1c.js", "/assets/index-77ab.css"];
  for (let i = 0; i < 3_000; i++) {
    const t = start + i * 1_200;
    const student = `49.36.${i % 50}.${(i * 13) % 250}`; // many real visitors (Indian mobile ranges)
    out.push(line(student, t, pages[i % pages.length], 200, 1000 + (i % 400)));
    if (i % 40 === 0) out.push(line(student, t, `/problem/does-not-exist-${i}`, 404, 153)); // stale bookmarks
    // Noids: internal containers hammer the API, including 404s and odd paths.
    out.push(line("127.0.0.1", t, `/api/submit?n=${i}`, 200, 300));
    out.push(line("172.18.0.7", t, `/api/missing-${i}`, 404, 120));
    out.push(line("10.0.3.4", t, "/.env", 404, 120)); // an internal health script asking for a probe path
    out.push(line("13.235.154.100", t, `/api/judge/missing-${i}`, 404, 120)); // our own server's public address
  }
  // One curious student opens a few odd URLs: well under the thresholds.
  for (let i = 0; i < 8; i++) out.push(line("103.21.1.9", start + i * 60_000, ["/.env", "/admin", "/.git", "/robots.txt"][i % 4], i % 2 ? 404 : 200, 5859));
  return out;
}

const parsed = (ls: string[]) => ls.map((l) => parseAccessLine(l)).filter((x): x is AccessLine => x !== null);

describe("access-log parsing and path rules", () => {
  it("parses Faurus's nginx line, with the line's own time", () => {
    const a = parseAccessLine(line(SCANNER, T0, "/.env", 200, 5859));
    assert.deepEqual(a, { ip: SCANNER, at: T0, method: "GET", path: "/.env", status: 200, bytes: 5859 });
    assert.equal(parseAccessLine('1.2.3.4 - - [17/Nov/2026:10:00:00 +0530] "GET / HTTP/2.0" 200 - "-" "x"')?.at, Date.UTC(2026, 10, 17, 4, 30));
    // An unparsable request (nginx logs an empty method and path) still counts its status.
    assert.equal(parseAccessLine('1.2.3.4 - - [17/Nov/2026:10:00:00 +0000] "  " 400 0 "-" "-"')?.path, "");
    for (const bad of ["Traceback (most recent call last):", "INFO 200 GET /", "not-an-ip - - [17/Nov/2026:10:00:00 +0000] \"GET / HTTP/1.1\" 200 1"]) assert.equal(parseAccessLine(bad), null);
  });
  it("knows scanner paths and leaves ordinary Faurus paths alone", () => {
    for (const p of PROBES) assert.ok(isSensitivePath(p), p);
    for (const p of ["/", "/problems", "/problem/two-sum", "/api/submission", "/learn/sql/keys-and-joins", "/assets/vendor-3f9a1c.js", "/assets/vendor.3f9a1c.js", "/api/token/refresh", "/learn/python/files", "/contest/42/ranking"])
      assert.ok(!isSensitivePath(p), p);
  });
  it("treats loopback, private and container addresses as internal", () => {
    for (const ip of ["127.0.0.1", "10.0.3.4", "172.18.0.7", "192.168.1.2", "100.64.0.1", "::1", "fd00::1", "fe80::1"]) assert.ok(isInternalIp(ip), ip);
    for (const ip of [SCANNER, "13.235.154.100", "2606:4700::1"]) assert.ok(!isInternalIp(ip), ip);
  });
});

describe("SlowScanDetector", () => {
  it("the 16-17 Nov scan gives one report for the address, within its first hour", () => {
    const d = new SlowScanDetector();
    const ls = parsed(scannerLines());
    const told = new Set<string>();
    const reports = [];
    for (let i = 0; i < ls.length; i += 200) {
      const batch = ls.slice(i, i + 200);
      const now = batch[batch.length - 1].at!;
      for (const r of d.feed(1, batch, now, [], (h) => told.has(h))) {
        reports.push(r);
        told.add(r.ipHash);
      }
    }
    // 20 hours, one message per 6 hours at most: hours 0, ~6, ~12, ~18.
    assert.ok(reports.length >= 1 && reports.length <= 4, `reports: ${reports.length}`);
    const first = reports[0];
    assert.equal(first.ip, SCANNER);
    assert.ok(first.until - T0 < 3_600_000, "first report within the first hour");
    assert.ok(first.probesInWindow >= 30);
    assert.deepEqual(first.sizes200, [[5859, first.status.find(([s]) => s === 200)![1]]]);
    for (let k = 1; k < reports.length; k++) assert.ok(reports[k].until - reports[k - 1].until >= 6 * 3_600_000);
  });

  it("many distinct 404 paths alone also count (>= 100 in an hour)", () => {
    const d = new SlowScanDetector();
    const ls = parsed(Array.from({ length: 120 }, (_, i) => line("45.9.8.7", T0 + i * 20_000, `/random-${i}`, 404, 153)));
    const r = d.feed(1, ls, T0 + 120 * 20_000);
    assert.equal(r.length, 1);
    assert.equal(r[0].missingInWindow, 100);
  });

  it("a slow trickle below the threshold over a day is not a scan (the window slides)", () => {
    const d = new SlowScanDetector();
    // 20 probes an hour for 24 hours: 480 in all, never 30 in one hour.
    const ls = parsed(Array.from({ length: 480 }, (_, i) => line("45.9.8.7", T0 + i * 180_000, PROBES[i % PROBES.length], 404, 153)));
    let n = 0;
    for (const l of ls) n += d.feed(1, [l], l.at!).length;
    assert.equal(n, 0);
  });

  it("normal student traffic and noids never trigger, and leave almost nothing in memory", () => {
    const d = new SlowScanDetector();
    const ls = parsed(normalLines());
    assert.equal(d.feed(1, ls, T0 + 3_600_000, ["13.235.154.100"]).length, 0);
    // Only addresses that asked for a sensitive or missing path are tracked: the students with stale links and the curious one.
    assert.ok(d.size <= 80, `tracked ${d.size}`);
  });

  it("our own server addresses are ignored, the same traffic from outside is not", () => {
    const ls = parsed(Array.from({ length: 40 }, (_, i) => line("13.235.154.100", T0 + i * 1000, "/.env", 404, 120)));
    assert.equal(new SlowScanDetector().feed(1, ls, T0 + 40_000, ["13.235.154.100"]).length, 0);
    assert.equal(new SlowScanDetector().feed(1, ls, T0 + 40_000, []).length, 1);
  });

  it("keeps nothing beyond the one-hour window", () => {
    const d = new SlowScanDetector();
    d.feed(1, parsed([line("45.9.8.7", T0, "/.env", 404, 1), line("49.36.1.2", T0, "/missing", 404, 1)]), T0);
    assert.equal(d.size, 2);
    d.feed(1, parsed([line("45.9.8.8", T0 + 3_600_001, "/.env", 404, 1)]), T0 + 3_600_001);
    assert.equal(d.size, 1); // the two older addresses are gone
  });

  it("memory stays bounded however many addresses scan", () => {
    const d = new SlowScanDetector({ maxIps: 100 });
    d.feed(1, parsed(Array.from({ length: 5_000 }, (_, i) => line(`45.${(i >> 8) & 255}.${i & 255}.1`, T0, "/.env", 404, 1))), T0);
    assert.ok(d.size <= 100);
  });
});

describe("the message and its delivery", () => {
  const setup = () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO projects (id, name, public_key, kind, settings, created_at) VALUES (1, 'faurus', 'k', 'faurus', '{}', ?)").run(new Date().toISOString());
    db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (1, 42, 7, ?)").run(new Date().toISOString());
    const sent: Array<{ text: string; quiet: boolean }> = [];
    const tg = {
      send: async (_c: number, text: string, _m?: unknown, opts: { quiet?: boolean } = {}) => (sent.push({ text, quiet: !!opts.quiet }), { message_id: 1, chat: { id: 42, type: "private" } }),
    } as unknown as Telegram;
    const w = new Worker(db, null, tg, null);
    return { db, sent, w };
  };

  it("names the owner from reverse DNS when cheap", () => {
    assert.equal(ownerFromRdns("29.115.97.34.bc.googleusercontent.com"), "Google Cloud");
    assert.equal(ownerFromRdns("ec2-1-2-3-4.compute-1.amazonaws.com"), "AWS");
    assert.equal(ownerFromRdns("host.example.net"), null);
    assert.equal(ownerFromRdns(null), null);
  });

  it("the drain sends exactly ONE quiet message for the whole 20-hour scan (first 6 hours), with a calm text", async () => {
    const { db, sent, w } = setup();
    const app = logRoutes(db, undefined, {
      told: (p, h) => w.slowScanTold(p, h, T0 + 3_600_000),
      report: (r) => void w.slowScan(r, T0 + 3_600_000, async () => "29.115.97.34.bc.googleusercontent.com"),
    });
    const ls = scannerLines(6);
    for (let i = 0; i < ls.length; i += 500) {
      const r = await app.request("/logs/1/k", { method: "POST", body: ls.slice(i, i + 500).join("\n"), headers: { "content-type": "text/plain" } });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).errors, 0); // access lines are not errors: no incident, no decision
    }
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].quiet, true);
    const t = sent[0].text;
    assert.match(t, /Slow scan on faurus/);
    assert.match(t, /34\.97\.115\.29/);
    assert.match(t, /Google Cloud/);
    assert.match(t, /same 5,859-byte page/);
    assert.match(t, /no data was exposed/);
    assert.doesNotMatch(t, /⚠/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number }).n, 0);
    // The address is never written down, only its hash.
    const kv = db.prepare("SELECT key, value FROM kv WHERE key LIKE 'slowscan:%'").all() as Array<{ key: string; value: string }>;
    assert.equal(kv.length, 1);
    assert.ok(!kv[0].key.includes(SCANNER));
  });

  it("a restart does not resend within 6 hours; after 6 hours a still-running scan gets one new message", async () => {
    const { sent, w } = setup();
    const ls = parsed(scannerLines(1));
    const run = async (now: number) => {
      const d = new SlowScanDetector(); // a fresh process
      for (const r of d.feed(1, ls.map((l) => ({ ...l, at: now - 60_000 })), now, [], (h) => w.slowScanTold(1, h, now))) await w.slowScan(r, now, async () => null);
    };
    await run(T0 + 3_600_000);
    await run(T0 + 2 * 3_600_000);
    assert.equal(sent.length, 1);
    await run(T0 + 8 * 3_600_000);
    assert.equal(sent.length, 2);
  });

  it("normal traffic through the drain sends nothing; a real traceback in the same drain is still an error", async () => {
    const { db, sent, w } = setup();
    setSettings(db, 1, { own_ips: ["13.235.154.100"] });
    const app = logRoutes(db, undefined, { told: (p, h) => w.slowScanTold(p, h), report: (r) => void w.slowScan(r, Date.now(), async () => null) });
    const normal = normalLines();
    for (let i = 0; i < normal.length; i += 3_000) {
      const r = await app.request("/logs/1/k", { method: "POST", body: normal.slice(i, i + 3_000).join("\n"), headers: { "content-type": "text/plain" } });
      assert.equal(r.status, 200);
    }
    const body = [
      "Traceback (most recent call last):",
      '  File "/app/submission/views.py", line 42, in post',
      "    x = data['code']",
      "KeyError: 'code'",
    ].join("\n");
    const r = await app.request("/logs/1/k", { method: "POST", body, headers: { "content-type": "text/plain" } });
    assert.equal((await r.json()).errors, 1);
    await new Promise((res) => setTimeout(res, 10));
    assert.equal(sent.length, 0);
  });

  it("says plainly what to check when a sensitive path got a different 200 answer or a 5xx", () => {
    const base = { projectId: 1, ip: SCANNER, ipHash: "h", since: T0, until: T0 + 3_600_000, probesInWindow: 40, missingInWindow: 3, total: 43, topPaths: [["/.env", 20]] as Array<[string, number]> };
    const t = buildSlowScanSummary("faurus", { ...base, status: [[200, 40], [500, 3]], sizes200: [[5859, 39], [812, 1]] });
    assert.match(t, /⚠ Check/);
    assert.match(t, /812 B ×1/);
    assert.match(t, /3 answers were server errors/);
    assert.doesNotMatch(t, /no data was exposed/);
    const ok = buildSlowScanSummary("faurus", { ...base, status: [[404, 43]], sizes200: [] });
    assert.match(ok, /Every probe got a 404/);
  });
});
