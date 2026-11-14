// No-code connection through log drains: errors are found in ordinary log lines, everything else is dropped.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb } from "../src/db/db.js";
import { extractLines, logRoutes, TraceFinder } from "../src/intake/logs.js";

const PY = [
  "INFO 200 GET /health",
  "Traceback (most recent call last):",
  '  File "/app/quiz/views.py", line 42, in submit',
  '    score = len(data["answers"])',
  "KeyError: 'answers'",
  "INFO 200 GET /",
];
const JS = ["TypeError: Cannot read properties of undefined (reading 'id')", "    at getUser (/srv/app/src/users.js:14:21)", "    at /srv/app/src/server.js:30:5", "listening"];

function setup() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (7, 'quizkart', 'secretkey', 'faurus', NULL, 'read', '{}', ?)").run(new Date().toISOString());
  const app = logRoutes(db);
  const post = (body: string, type = "text/plain", key = "secretkey") => app.request(`/logs/7/${key}`, { method: "POST", body, headers: { "content-type": type } });
  const incidents = () => db.prepare("SELECT exception_type, transaction_name, hits FROM incidents ORDER BY id").all() as Array<{ exception_type: string; transaction_name: string | null; hits: number }>;
  return { db, post, incidents };
}

describe("log drains", () => {
  it("finds a Python traceback and a Node.js stack in plain text logs", async () => {
    const { post, incidents } = setup();
    const r = await post([...PY, ...JS].join("\n"));
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).errors, 2);
    assert.deepEqual(incidents().map((i) => i.exception_type), ["KeyError", "TypeError"]);
  });

  it("refuses a wrong key", async () => {
    const { post } = setup();
    assert.equal((await post(PY.join("\n"), "text/plain", "nope")).status, 403);
  });

  it("reads JSON drains with request paths, and keeps parallel requests apart", async () => {
    const { post, incidents } = setup();
    // Two requests' lines interleaved; only request A crashes.
    const a = PY.slice(1).map((message) => ({ message, requestId: "A", proxy: { path: "/api/quiz/submit?x=1" } }));
    const b = ["INFO b1", "INFO b2", "INFO b3", "INFO b4"].map((message) => ({ message, requestId: "B" }));
    const mixed = a.flatMap((x, i) => [x, b[i]]);
    await post(JSON.stringify(mixed), "application/json");
    assert.deepEqual(incidents(), [{ exception_type: "KeyError", transaction_name: "/api/quiz/submit", hits: 1 }]);
  });

  it("reads Heroku logplex frames", () => {
    const msg = (m: string) => `<190>1 2026-11-13T10:00:00+00:00 host app web.1 - ${m}`;
    const body = PY.map(msg).map((m) => `${Buffer.byteLength(m)} ${m}`).join("");
    const lines = extractLines(body, "application/logplex-1");
    assert.equal(lines.length, PY.length);
    assert.equal(lines[1].stream, "app/web.1");
    assert.equal(lines[1].text, "Traceback (most recent call last):");
  });

  it("joins a stack trace split across two deliveries", () => {
    const f = new TraceFinder();
    const lines = (t: string[]) => t.map((text) => ({ stream: "s", text }));
    assert.equal(f.push("p", lines(PY.slice(0, 3))).length, 0);
    assert.equal(f.push("p", lines(PY.slice(3))).length, 1);
  });

  it("counts the same trace delivered twice (a drain retry) once", async () => {
    const { post, incidents } = setup();
    await post(PY.join("\n"));
    await post(PY.join("\n"));
    assert.equal(incidents()[0].hits, 1);
  });

  it("stores nothing from ordinary log lines", async () => {
    const { db, post } = setup();
    await post("INFO user signed in email=a@b.co\nWARN slow query 900ms\nError budget fine");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n, 0);
  });
});

describe("log drains: memory", () => {
  it("keeps at most 300 streams in memory, and clips long lines", () => {
    const f = new TraceFinder();
    const lines = Array.from({ length: 5000 }, (_, i) => ({ stream: `req-${i}`, text: "Traceback (most recent call last):" }));
    f.push("p", lines);
    assert.ok((f as unknown as { streams: Map<string, unknown> }).streams.size <= 300);
    assert.equal(extractLines("x".repeat(50_000))[0].text.length, 2000);
  });
});

describe("log drains: body limit", () => {
  it("refuses an oversized chunked upload that has no Content-Length", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (7, 'q', 'secretkey', 'faurus', NULL, 'read', '{}', ?)").run(new Date().toISOString());
    const app = logRoutes(db);
    const chunk = new TextEncoder().encode("INFO ".repeat(20_000));
    let sent = 0;
    const body = new ReadableStream({
      pull(ctrl) {
        if (sent++ > 30) ctrl.close();
        else ctrl.enqueue(chunk);
      },
    });
    const r = await app.request("/logs/7/secretkey", { method: "POST", body, headers: { "content-type": "text/plain" }, duplex: "half" } as RequestInit);
    assert.equal(r.status, 413);
  });
});

describe("log drain: hostile bodies stay cheap", () => {
  it("scans a 1 MB body of exception-looking lines in linear time", () => {
    const f = new TraceFinder();
    const bodies = [
      "ValueError\n".repeat(95_000),
      `TypeError: x\n${"    at x (a.js:1:1)\n".repeat(50_000)}`,
      `Traceback (most recent call last):\n${"ValueError\n".repeat(95_000)}`,
    ];
    for (const body of bodies) {
      const t = performance.now();
      f.push("1", extractLines(body), Date.now());
      f.flush("1");
      assert.ok(performance.now() - t < 250, `took ${Math.round(performance.now() - t)} ms`);
    }
  });

  it("still finds a traceback after a long run of noise, and a JS stack at the end of a request", () => {
    const f = new TraceFinder();
    const noise = Array.from({ length: 500 }, (_, i) => `INFO line ${i}`);
    const py = f.push("1", extractLines([...noise, ...PY].join("\n")), Date.now());
    assert.equal(py.length, 1);
    assert.match(py[0].text, /^Traceback[\s\S]*KeyError: 'answers'$/);
    const js = [...f.push("2", extractLines([...noise, "TypeError: boom", "    at f (/app/a.js:1:1)", "    at g (/app/b.js:2:2)"].join("\n")), Date.now()), ...f.flush("2")];
    assert.equal(js.length, 1);
    assert.equal(js[0].text.split("\n").length, 3);
  });
});
