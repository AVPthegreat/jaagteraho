// Telegram /new creates an owned app; spend is charged to the app that caused it; free credit runs out.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpendGuard, spendContext } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { createOutsideApp, creditLeftForProject, creditOf } from "../src/projects.js";
import type { Worker } from "../src/pipeline/worker.js";
import type { Telegram, TgMessage } from "../src/telegram/api.js";
import { Bot } from "../src/telegram/bot.js";

function bot() {
  const db = openDb(":memory:");
  const sent: string[] = [];
  const tg = { send: async (_c: number, t: string) => void sent.push(t) } as unknown as Telegram;
  const b = new Bot(db, tg, {} as Worker);
  const say = (text: string, user = 7) =>
    (b as unknown as { onMessage(m: TgMessage): Promise<unknown> }).onMessage({ message_id: 1, chat: { id: user * 10, type: "private" }, from: { id: user }, text } as TgMessage);
  return { db, sent, say };
}

describe("apps and credit", () => {
  it("/new creates an app owned by the sender, without a repository", async () => {
    const { db, sent, say } = bot();
    await say("/new quizkart");
    assert.match(sent.at(-1)!, /quizkart-[0-9a-f]{4}<\/b> is ready/);
    assert.match(sent.at(-1)!, /npx jaagteraho init --dsn http:\/\/[0-9a-f]{32}@/);
    const o = db.prepare("SELECT o.user_id, p.settings, p.repo FROM owners o JOIN projects p ON p.id = o.project_id").get() as { user_id: number; settings: string; repo: string | null };
    assert.equal(o.user_id, 7);
    assert.match(o.settings, /"outside":true/);
    assert.equal(o.repo, null);
    await say("/credits");
    assert.match(sent.at(-1)!, /Left: \$5.000/);
  });

  it("/new refuses a bad name and stops at 3 apps per owner", async () => {
    const { sent, say } = bot();
    await say("/new");
    assert.match(sent.at(-1)!, /followed by your app's name/);
    for (const n of ["a1", "a2", "a3", "a4"]) await say(`/new ${n}`);
    assert.match(sent.at(-1)!, /already have 3 apps/);
  });

  it("charges spend to the app it was made for, and runs out at the free credit", () => {
    const db = openDb(":memory:");
    const app = createOutsideApp(db, "shop", null);
    db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, 1, 9, ?)").run(app.id, new Date().toISOString());
    const guard = new SpendGuard(db, 40, 45);
    spendContext.run({ projectId: app.id }, () => guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 1_000_000, output_tokens: 100_000 }));
    guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 1_000_000, output_tokens: 0 }); // not for any app
    assert.equal(creditOf(db, 9).used, 3);
    assert.equal(creditLeftForProject(db, app.id), 2);
    spendContext.run({ projectId: app.id }, () => guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 3_000_000, output_tokens: 0 }));
    assert.equal(creditLeftForProject(db, app.id), 0);
  });

  it("our own apps never use credit", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (1, 'faurus', 'k', 'faurus', NULL, 'read', '{}', ?)").run(new Date().toISOString());
    assert.equal(creditLeftForProject(db, 1), Infinity);
  });
});

describe("decision budget for outside apps", () => {
  it("makes no model calls for an outside app until an owner is linked", async () => {
    const { storeEvent } = await import("../src/intake/store.js");
    const { Worker } = await import("../src/pipeline/worker.js");
    const db = openDb(":memory:");
    const app = createOutsideApp(db, "shop", null);
    let calls = 0;
    const ai = {
      client: { messages: { parse: async () => (calls++, { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { is_noise: "no", severity: "2", category: "unknown", user_blocked: "no", suggested_action: "notify" } }) } },
      guard: new SpendGuard(db, 40, 45),
      decisionModel: "claude-haiku-5-5",
      diagnosisModel: "claude-sonnet-5-5",
    };
    const ev = (n: number) => ({ event_id: String(n).padStart(32, "c"), timestamp: new Date().toISOString(), level: "error", platform: "python", release: null, environment: null, transaction: `/x${n}`, exception_type: `E${n}`, message: "m", chain: [], frames: [], tags: {}, sdk: null });
    const drain = async () => {
      const w = new Worker(db, ai as never, null, null);
      w.start();
      for (let i = 0; i < 60; i++) {
        if ((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get() as { n: number }).n === 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      w.stop();
    };
    storeEvent(db, app.id, ev(1));
    await drain();
    assert.equal(calls, 0, "no owner: rules only");
    db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, 1, 9, ?)").run(app.id, new Date().toISOString());
    storeEvent(db, app.id, ev(2));
    await drain();
    assert.ok(calls >= 5, "owner linked: Claude votes");
  });
});
