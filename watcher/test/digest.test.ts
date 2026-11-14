// The "while you slept" summary: what it counts, what it hides from other owners, and when it is sent.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb } from "../src/db/db.js";
import type { CleanEvent } from "../src/intake/allowlist.js";
import { storeEvent } from "../src/intake/store.js";
import type { Worker } from "../src/pipeline/worker.js";
import type { Telegram } from "../src/telegram/api.js";
import { Bot } from "../src/telegram/bot.js";
import { buildDigest, istNow } from "../src/telegram/digest.js";

const ev = (type: string, route: string, n: number): CleanEvent => ({
  event_id: `${type}${n}`.padEnd(32, "0"),
  timestamp: new Date().toISOString(),
  level: "error",
  platform: "python",
  release: "t",
  environment: "t",
  transaction: route,
  exception_type: type,
  message: "x",
  chain: [],
  frames: [{ filename: "app/x.py", abs_path: "/app/x.py", module: "app.x", function: route.slice(1), lineno: 3, in_app: true, context_line: "", pre_context: [], post_context: [] }],
  tags: {},
  sdk: "t",
});

function setup() {
  const db = openDb(":memory:");
  const now = new Date().toISOString();
  for (const [id, name] of [[1, "faurus"], [2, "someone-else"]] as const) {
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (?, ?, ?, 'faurus', NULL, 'read', '{}', ?)").run(id, name, `k${id}`, now);
  }
  db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (1, 42, 7, ?), (2, 99, 8, ?)").run(now, now);
  for (let i = 0; i < 3; i++) storeEvent(db, 1, ev("KeyError", "/api/submission", i));
  storeEvent(db, 1, ev("ValueError", "/profile", 9));
  storeEvent(db, 2, ev("SecretError", "/private", 1));
  const inc = db.prepare("SELECT id FROM incidents WHERE project_id = 1 AND exception_type = 'KeyError'").get() as { id: number };
  db.prepare("INSERT INTO decisions (incident_id, facts, votes, rule_number, rule_text, action, engine, created_at) VALUES (?, '{}', '[]', 2, 'r', 'wake', 'claude', ?)").run(inc.id, now);
  const d = db
    .prepare("INSERT INTO diagnoses (incident_id, model, cost_usd, result, created_at) VALUES (?, 'm', 0.012, '{}', ?)")
    .run(inc.id, now).lastInsertRowid;
  db.prepare("INSERT INTO fixes (diagnosis_id, diff, gate_result, status, created_at) VALUES (?, '', '{}', 'shown', ?)").run(d, now);
  return db;
}

describe("digest", () => {
  it("counts errors, decisions and fixes for the owner's projects only", () => {
    const db = setup();
    const text = buildDigest(db, [1], new Date(Date.now() - 3_600_000).toISOString())!;
    assert.match(text, /4 errors reported/);
    assert.match(text, /1 woke you/);
    assert.match(text, /KeyError on \/api\/submission ×3 \(woke you\)/);
    assert.match(text, /Fixes: 1 proposed, 0 withheld/);
    assert.match(text, /\$0\.012/);
    assert.doesNotMatch(text, /SecretError|someone-else/);
  });

  it("returns nothing when nothing happened", () => {
    const db = setup();
    assert.equal(buildDigest(db, [1], new Date(Date.now() + 60_000).toISOString()), null);
  });

  it("works out the hour in India", () => {
    assert.deepEqual(istNow(new Date("2026-11-13T02:30:00Z")), { date: "2026-11-13", hour: 8 });
    assert.deepEqual(istNow(new Date("2026-11-12T19:00:00Z")), { date: "2026-11-13", hour: 0 });
  });

  it("sends the morning summary once a day, after 08:00 IST, to each owner", async () => {
    const db = setup();
    const sent: Array<[number, string]> = [];
    const tg = { send: async (c: number, t: string) => void sent.push([c, t]) } as unknown as Telegram;
    const bot = new Bot(db, tg, {} as Worker);
    const at = (iso: string) => new Date(iso);
    const istDate = istNow().date;
    // 07:00 IST: too early.
    assert.equal(await bot.morningDigest(at(`${istDate}T01:30:00Z`)), 0);
    // 08:10 IST: sent to both owners, each with their own project only.
    assert.equal(await bot.morningDigest(at(`${istDate}T02:40:00Z`)), 2);
    assert.equal(sent.find(([c]) => c === 99)![1].includes("KeyError"), false);
    assert.equal(sent.find(([c]) => c === 42)![1].includes("SecretError"), false);
    // Later the same day: not again.
    assert.equal(await bot.morningDigest(at(`${istDate}T05:00:00Z`)), 0);
  });
});
