// End-to-end test of the worker with a stand-in Claude and a stand-in Telegram:
// error in, decision, alert card, diagnosis against the real sandbox source, fix gate, card edits.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { AI } from "../src/ai/claude.js";
import { SpendGuard } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import type { CleanEvent } from "../src/intake/allowlist.js";
import { storeEvent } from "../src/intake/store.js";
import { Worker } from "../src/pipeline/worker.js";
import type { Telegram } from "../src/telegram/api.js";

const SANDBOX = fileURLToPath(new URL("../../sandbox", import.meta.url)).replace(/\/$/, "");

function fakeAI(db: ReturnType<typeof openDb>, opts: { failDecisions?: boolean } = {}) {
  const calls: string[] = [];
  const usage = { input_tokens: 1000, output_tokens: 100 };
  const client = {
    messages: {
      parse: async (req: { system: string }) => {
        if (req.system.includes("You assess one production error")) {
          calls.push("decision");
          if (opts.failDecisions) throw new Error("simulated outage");
          return { stop_reason: "end_turn", usage, parsed_output: { is_noise: "no", severity: "3", category: "unhandled_input", user_blocked: "yes", suggested_action: "wake" } };
        }
        if (req.system.includes("diagnosis step")) {
          calls.push("diagnosis");
          return {
            stop_reason: "end_turn",
            usage,
            parsed_output: {
              cause_plain: "The submit button sends no language, so the server crashes.",
              cause_technical: "portal/submissions.py line 14 reads data['language'] without checking it exists.",
              file: "portal/submissions.py",
              line: 14,
              confidence_words: "sure",
              edits: [{ file: "portal/submissions.py", find: '    language = data["language"]', replace: '    language = data.get("language", "python")' }],
              test_hint: "Submit without a language.",
            },
          };
        }
        calls.push("review");
        return { stop_reason: "end_turn", usage, parsed_output: { fix_quality: "3", touches_sensitive: "no", could_break: "no" } };
      },
    },
  };
  const ai = { client, guard: new SpendGuard(db, 40, 45), decisionModel: "claude-haiku-5-5", diagnosisModel: "claude-sonnet-5-5" } as unknown as AI;
  return { ai, calls };
}

function fakeTelegram() {
  const sent: string[] = [];
  const edits: string[] = [];
  let id = 100;
  const tg = {
    send: async (_chat: number, text: string) => (sent.push(text), { message_id: ++id, chat: { id: 1, type: "private" } }),
    edit: async (_c: number, _m: number, text: string) => void edits.push(text),
    sendVoice: async () => undefined,
    call: async () => ({}),
    answer: async () => undefined,
  } as unknown as Telegram;
  return { tg, sent, edits };
}

function setup() {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (1, 'sandbox', 'k', 'sandbox', ?, 'sandbox-write', ?, ?)",
  ).run(`local:${SANDBOX}`, JSON.stringify({ critical: [{ name: "code submission", match: "/api/submit" }] }), new Date().toISOString());
  db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (1, 42, 7, ?)").run(new Date().toISOString());
  return db;
}

const event = (exam: "on" | "off", route = "/api/submit"): CleanEvent => ({
  event_id: Math.random().toString(16).slice(2).padEnd(32, "0"),
  timestamp: new Date().toISOString(),
  level: "error",
  platform: "python",
  release: "test",
  environment: "test",
  transaction: route,
  exception_type: "KeyError",
  message: "'language'",
  chain: [],
  frames: [
    { filename: "portal/views.py", abs_path: `${SANDBOX}/portal/views.py`, module: "portal.views", function: "submit_code", lineno: 35, in_app: true, context_line: "    return JsonResponse(prepare_submission(data))", pre_context: [], post_context: [] },
    { filename: "portal/submissions.py", abs_path: `${SANDBOX}/portal/submissions.py`, module: "portal.submissions", function: "prepare_submission", lineno: 14, in_app: true, context_line: '    language = data["language"]', pre_context: [], post_context: [] },
  ],
  tags: { jr_exam: exam, jr_session: "sess-test-1" },
  sdk: "test",
});

async function drain(db: ReturnType<typeof openDb>, worker: Worker) {
  worker.start();
  for (let i = 0; i < 100; i++) {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued', 'running')").get() as { n: number }).n;
    if (n === 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  worker.stop();
}

describe("worker pipeline", () => {
  it("wakes the owner for a critical flow during an exam, diagnoses from source, and shows a gated fix", async () => {
    const db = setup();
    const { ai, calls } = fakeAI(db);
    const { tg, sent, edits } = fakeTelegram();
    storeEvent(db, 1, event("on"));
    await drain(db, new Worker(db, ai, tg, null));

    const d = db.prepare("SELECT action, rule_number, engine FROM decisions").get() as { action: string; rule_number: number; engine: string };
    assert.deepEqual(d, { action: "wake", rule_number: 2, engine: "claude" });
    assert.equal(calls.filter((c) => c === "decision").length, 5);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /WAKE/);
    assert.match(edits.at(-1)!, /Cause:/);
    assert.match(edits.at(-1)!, /all checks passed/);
    const fix = db.prepare("SELECT status, diff FROM fixes").get() as { status: string; diff: string };
    assert.equal(fix.status, "shown");
    assert.match(fix.diff, /data\.get\("language", "python"\)/);
    assert.ok((db.prepare("SELECT SUM(cost_usd) AS t FROM spend").get() as { t: number }).t > 0);
  });

  it("falls back to rules and still notifies when Claude is down", async () => {
    const db = setup();
    db.prepare("UPDATE projects SET settings = '{}' WHERE id = 1").run();
    const { ai } = fakeAI(db, { failDecisions: true });
    const { tg, sent } = fakeTelegram();
    storeEvent(db, 1, event("off", "/api/other"));
    await drain(db, new Worker(db, ai, tg, null));
    const d = db.prepare("SELECT action, engine FROM decisions").get() as { action: string; engine: string };
    assert.deepEqual(d, { action: "notify", engine: "rules-only" });
    assert.equal(sent.length, 1);
  });

  it("makes no model calls in learn mode", async () => {
    const db = setup();
    db.prepare("UPDATE projects SET settings = ? WHERE id = 1").run(JSON.stringify({ learn_until: new Date(Date.now() + 3_600_000).toISOString() }));
    const { ai, calls } = fakeAI(db);
    const { tg, sent } = fakeTelegram();
    storeEvent(db, 1, event("on"));
    await drain(db, new Worker(db, ai, tg, null));
    assert.equal(calls.length, 0);
    assert.equal(sent.length, 0);
    assert.equal((db.prepare("SELECT action FROM decisions").get() as { action: string }).action, "log");
    assert.equal((db.prepare("SELECT status FROM incidents").get() as { status: string }).status, "backlog");
  });
});

describe("worker limits", () => {
  it("holds a fourth wake in 12 hours on a real app, and caps fixes at 3 a day", async () => {
    const db = setup();
    db.prepare("UPDATE projects SET kind = 'faurus', settings = ? WHERE id = 1").run(JSON.stringify({ critical: [{ name: "code submission", match: "/api/submit" }], exam_until: new Date(Date.now() + 3_600_000).toISOString() }));
    const { ai } = fakeAI(db);
    const { tg } = fakeTelegram();
    // Four different incidents (different routes, all critical) during an exam window.
    for (const route of ["/api/submit/a", "/api/submit/b", "/api/submit/c", "/api/submit/d"]) storeEvent(db, 1, event("off", route));
    await drain(db, new Worker(db, ai, tg, null));
    const actions = (db.prepare("SELECT action, rule_text FROM decisions ORDER BY id").all() as Array<{ action: string; rule_text: string }>);
    assert.deepEqual(actions.map((a) => a.action), ["wake", "wake", "wake", "notify"]);
    assert.match(actions[3].rule_text, /wake held/);
    const statuses = (db.prepare("SELECT status FROM fixes ORDER BY id").all() as Array<{ status: string }>).map((f) => f.status);
    assert.equal(statuses.filter((s) => s === "shown").length, 3);
  });

  it("deletes raw events older than 30 days and keeps the incident", () => {
    const db = setup();
    storeEvent(db, 1, event("off"));
    db.prepare("UPDATE events SET received_at = ?").run(new Date(Date.now() - 31 * 86_400_000).toISOString());
    const removed = new Worker(db, null, null, null).purgeOldEvents();
    assert.equal(removed, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number }).n, 1);
  });
});
