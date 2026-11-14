// Setup checks: a test error says "connected" without any model call; the first real error
// announces the connection once; users are counted only through a one-way hash.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb } from "../src/db/db.js";
import { allowlistEvent, userHash, type CleanEvent } from "../src/intake/allowlist.js";
import { storeEvent } from "../src/intake/store.js";
import { usersAffected } from "../src/pipeline/decide.js";
import { Worker } from "../src/pipeline/worker.js";
import type { Telegram } from "../src/telegram/api.js";

function setup() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (5, 'quizkart', 'k', 'faurus', NULL, 'read', '{}', ?)").run(new Date().toISOString());
  db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (5, 42, 7, ?)").run(new Date().toISOString());
  const sent: string[] = [];
  const tg = {
    send: async (_c: number, t: string) => (sent.push(t), { message_id: sent.length, chat: { id: 42, type: "private" } }),
    edit: async () => undefined,
    sendVoice: async () => undefined,
    call: async () => ({}),
  } as unknown as Telegram;
  return { db, sent, tg };
}

const ev = (n: number, tags: Record<string, string> = {}): CleanEvent => ({
  event_id: String(n).padStart(32, "a"),
  timestamp: new Date().toISOString(),
  level: "error",
  platform: "python",
  release: null,
  environment: null,
  transaction: "/quiz/submit",
  exception_type: tags.jr_test ? "JaagteRahoTestError" : "KeyError",
  message: "x",
  chain: [],
  frames: [],
  tags,
  sdk: null,
});

async function drain(db: ReturnType<typeof openDb>, w: Worker) {
  w.start();
  for (let i = 0; i < 60; i++) {
    if ((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get() as { n: number }).n === 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  w.stop();
}

describe("setup checks", () => {
  it("a test error replies 'connected' and never calls a model", async () => {
    const { db, sent, tg } = setup();
    storeEvent(db, 5, ev(1, { jr_test: "1" }));
    await drain(db, new Worker(db, null, tg, null));
    assert.equal(sent.length, 1);
    assert.match(sent[0], /quizkart is connected/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM decisions").get() as { n: number }).n, 0);
  });

  it("the first real error announces the connection once", async () => {
    const { db, sent, tg } = setup();
    storeEvent(db, 5, ev(2));
    storeEvent(db, 5, { ...ev(3), exception_type: "ValueError" });
    await drain(db, new Worker(db, null, tg, null));
    assert.equal(sent.filter((t) => /is connected/.test(t)).length, 1);
  });

  it("keeps only a hash of the user, and counts distinct people", () => {
    const raw = { event_id: "b".repeat(32), exception: { values: [{ type: "E", value: "v" }] }, user: { id: 991, email: "a@b.co", ip_address: "1.2.3.4" }, tags: { jr_test: "1", other: "x" } };
    const clean = allowlistEvent(raw)!;
    assert.match(clean.tags.jr_user, /^[0-9a-f]{12}$/);
    assert.equal(clean.tags.jr_test, "1");
    assert.equal(clean.tags.other, undefined);
    assert.doesNotMatch(JSON.stringify(clean), /a@b\.co|1\.2\.3\.4|991/);
    assert.equal(userHash({ ip_address: "{{auto}}" }), null);
    assert.equal(userHash({ id: 1 }), userHash({ id: "1" }));

    const { db } = setup();
    for (const [n, u] of [[10, "u1"], [11, "u2"], [12, "u1"]] as const) storeEvent(db, 5, ev(n, { jr_user: u }));
    const inc = db.prepare("SELECT id FROM incidents").get() as { id: number };
    assert.equal(usersAffected(db, inc.id, 60), 2);
  });
});

describe("critical routes", () => {
  it("match Node.js transaction names that start with the HTTP method", async () => {
    const { computeFacts } = await import("../src/pipeline/decide.js");
    const db = openDb(":memory:");
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (5, 'quizapi', 'k', 'faurus', NULL, 'read', ?, ?)").run(
      JSON.stringify({ critical: [{ name: "quiz submit", match: "/api/quiz" }] }),
      new Date().toISOString(),
    );
    const facts = (transaction: string) =>
      computeFacts(db, { incidentId: 1, projectId: 5, projectName: "quizapi", change: "new", status: "open", hits: 1, event: { exception_type: "TypeError", message: "", transaction, frames: [], tags: {} } });
    assert.equal(facts("POST /api/quiz/submit").critical, "quiz submit");
    assert.equal(facts("/api/quiz/submit").critical, "quiz submit");
    assert.equal(facts("GET /api/other").critical, null);
  });
});
