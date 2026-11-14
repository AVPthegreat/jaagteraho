// The Live playground with a stand-in Claude (no network, no spend): a real planted bug in a real app copy,
// the real pipeline (decide, diagnose, gate, proveFix) and our hidden test; the spend-cap replay; the public
// routes' limits; and the rule that the playground never messages or calls anyone.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AI } from "../src/ai/claude.js";
import { SpendGuard } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { playgroundBus, type PlaygroundEvent } from "../src/playground/events.js";
import { Playground } from "../src/playground/runner.js";
import { laneFor, phoneAllowedFor, Worker } from "../src/pipeline/worker.js";
import type { Phone } from "../src/phone/phone.js";
import type { Telegram } from "../src/telegram/api.js";
import { playgroundRoutes } from "../src/web/playground.js";

const BENCH = fileURLToPath(new URL("../../bench", import.meta.url)).replace(/\/$/, "");
const CASE_ID = "messmenu-missing-plates";

// A bench folder with one app and one published case, so the test does not depend on the extra cases.
const dir = mkdtempSync(join(tmpdir(), "jrpgtest-"));
after(() => rmSync(dir, { recursive: true, force: true }));
{
  const bench = JSON.parse(readFileSync(join(BENCH, "cases.json"), "utf8"));
  cpSync(join(BENCH, "apps", "messmenu"), join(dir, "apps", "messmenu"), { recursive: true });
  writeFileSync(join(dir, "cases.json"), JSON.stringify({ apps: { messmenu: bench.apps.messmenu }, cases: bench.cases.filter((c: { id: string }) => c.id === CASE_ID) }));
}

const REGRESSION = `import unittest
from messmenu.app import handle

class T(unittest.TestCase):
    def test_booking_without_plates(self):
        handle('POST', '/api/meals', {'title': 'Rajma', 'price': '60', 'served_on': '2026-11-13', 'plates': 200})
        r = handle('POST', '/api/bookings', {'student': 'Asha', 'meal_id': 1, 'booked_on': '2026-11-13'})
        self.assertEqual(r['status'], 400)
`;

function fakeAI(db: ReturnType<typeof openDb>) {
  const calls: string[] = [];
  const usage = { input_tokens: 1000, output_tokens: 100 };
  const client = {
    messages: {
      parse: async (req: { system: string }) => {
        if (req.system.includes("You assess one production error")) {
          calls.push("decision");
          return { stop_reason: "end_turn", usage, parsed_output: { is_noise: "no", severity: "3", category: "unhandled_input", user_blocked: "yes", suggested_action: "wake" } };
        }
        if (req.system.includes("diagnosis step")) {
          calls.push("diagnosis");
          return {
            stop_reason: "end_turn",
            usage,
            parsed_output: {
              cause_plain: "Booking a meal without the number of plates crashes, because the form check no longer asks for it.",
              cause_technical: "messmenu/booking/routes.py: require_fields no longer lists 'plates', so the service reads a missing key.",
              file: "messmenu/booking/routes.py",
              line: 13,
              confidence_words: "sure",
              edits: [{ file: "messmenu/booking/routes.py", find: 'require_fields(body, "student", "meal_id", "booked_on")', replace: 'require_fields(body, "student", "meal_id", "plates", "booked_on")' }],
              test_hint: "Book without plates.",
              regression_test: { file: "tests/test_booking.py", code: REGRESSION },
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

function collect(app: string) {
  const got: PlaygroundEvent[] = [];
  const on = (ev: PlaygroundEvent) => got.push(ev);
  playgroundBus.on(`app:${app}`, on);
  return { got, stop: () => playgroundBus.off(`app:${app}`, on) };
}

describe("playground runner", () => {
  it("plants a real bug, runs the real pipeline and proves the fix with our hidden test", async () => {
    const db = openDb(":memory:");
    const { ai, calls } = fakeAI(db);
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    assert.deepEqual(pg.apps.map((a) => a.name), ["messmenu"]);
    assert.equal(pg.apps[0].title, "MessMenu");
    const feed = collect("messmenu");
    assert.equal(pg.startNow("messmenu"), "live");
    assert.equal(pg.startNow("messmenu"), null, "one run in flight per app");
    await pg.settle();
    feed.stop();
    assert.deepEqual(feed.got.map((e) => e.step), ["plant", "crash", "connected", "decision", "cause", "gate", "own_test", "hidden_test", "done"]);
    const crash = feed.got.find((e) => e.step === "crash")!;
    assert.match(String(crash.data.traceback), /Traceback \(most recent call last\)/);
    assert.equal(crash.data.exception_type, "KeyError");
    assert.doesNotMatch(String(crash.data.traceback), /jrplay-/, "no temp paths shown");
    assert.equal(crash.data.where, "messmenu/booking/service.py:14");
    const card = pg.latest(1)[0];
    assert.equal(card.case_id, CASE_ID);
    assert.equal(card.case_source, "benchmark");
    assert.equal(card.right_file, true);
    assert.equal(card.gate, "recommended");
    assert.equal(card.own_test, "proved");
    assert.equal(card.hidden_test, "passed");
    assert.ok(card.cost_usd > 0, "the stand-in's token use is charged to the run");
    assert.ok(card.seconds_to_cause !== null && card.seconds_to_proved_fix !== null);
    assert.deepEqual([...new Set(calls)].sort(), ["decision", "diagnosis", "review"]);
    // Charged to the playground's own lane, under the playground app's own record.
    const lanes = db.prepare("SELECT DISTINCT lane FROM spend").all() as Array<{ lane: string }>;
    assert.deepEqual(lanes.map((l) => l.lane), ["playground"]);
    const pid = (db.prepare("SELECT id FROM projects WHERE name = 'playground-messmenu'").get() as { id: number }).id;
    assert.equal(laneFor(db, pid), "playground");
    pg.stop();
  });

  it("a wrong fix is caught by the hidden test", async () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    const parse = ai.client.messages.parse.bind(ai.client.messages);
    (ai.client.messages as { parse: unknown }).parse = async (req: { system: string }) => {
      const r = (await parse(req as never)) as { parsed_output: Record<string, unknown> };
      if (req.system.includes("diagnosis step"))
        r.parsed_output = { ...r.parsed_output, edits: [{ file: "messmenu/booking/routes.py", find: 'require_fields(body, "student", "meal_id", "booked_on")', replace: 'require_fields(body, "student", "booked_on")' }] };
      return r;
    };
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    pg.startNow("messmenu");
    await pg.settle();
    const card = pg.latest(1)[0];
    assert.equal(card.hidden_test, "failed");
    assert.notEqual(card.own_test, "proved");
    pg.stop();
  });

  it("at a spend cap it replays a real past run, marked as a replay, and stores nothing new", async () => {
    const db = openDb(":memory:");
    const { ai, calls } = fakeAI(db);
    let budget = true;
    const pg = new Playground(db, ai, { dir, canSpend: () => budget, everyMs: 0 });
    // No past run and no budget: nothing is shown as a result.
    budget = false;
    assert.equal(pg.startNow("messmenu"), null);
    budget = true;
    pg.startNow("messmenu");
    await pg.settle();
    const before = calls.length;
    budget = false;
    const feed = collect("messmenu");
    assert.equal(pg.startNow("messmenu", Date.now() + 1), "replay");
    for (let i = 0; i < 800 && !feed.got.some((e) => e.step === "done"); i++) await new Promise((r) => setTimeout(r, 25));
    feed.stop();
    assert.equal(feed.got[0].step, "replay");
    assert.ok(feed.got.slice(1).every((e) => e.replay_of?.run_id === pg.latest(1)[0].run_id));
    assert.ok(feed.got.some((e) => e.step === "done"));
    assert.equal(calls.length, before, "a replay makes no model call");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM playground_runs").get() as { n: number }).n, 1);
    pg.stop();
  });

  it("idle: one live run per idle period with nobody watching, none when the cap is reached", async () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    let budget = false;
    const pg = new Playground(db, ai, { dir, canSpend: () => budget, idleMs: 60_000 });
    await pg.tick(Date.now() + 120_000);
    assert.equal(pg.isRunning("messmenu"), false, "no budget: no run and no replay for nobody");
    budget = true;
    await pg.tick(Date.now() + 240_000);
    assert.equal(pg.isRunning("messmenu"), true);
    await pg.settle();
    await pg.tick(Date.now() + 250_000);
    assert.equal(pg.isRunning("messmenu"), false, "the next idle run waits for the idle period");
    pg.stop();
  });
});

describe("playground never messages or calls anyone", () => {
  it("phoneAllowedFor refuses the playground even with JR_DEMO_PHONE=1", () => {
    assert.equal(phoneAllowedFor("sandbox", { JR_DEMO_PHONE: "1" }, { playground: true }), false);
    assert.equal(phoneAllowedFor("sandbox", { JR_DEMO_PHONE: "1" }, {}), true);
  });

  it("a run leaves no job for the worker, and the worker skips playground apps even with an owner linked", async () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    const sent: string[] = [];
    const tg = {
      send: async (_c: number, text: string) => (sent.push(text), { message_id: 1, chat: { id: 1, type: "private" } }),
      edit: async (_c: number, _m: number, text: string) => void sent.push(text),
      sendVoice: async () => void sent.push("voice"),
      call: async () => (sent.push("call"), {}),
      answer: async () => undefined,
    } as unknown as Telegram;
    const rang: number[] = [];
    const phone = { wake: async (id: number) => void rang.push(id), repeat: async (id: number) => void rang.push(id) } as unknown as Phone;
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    // Even if someone linked an owner to a playground app by mistake, nothing goes out.
    assert.equal(pg.settingsOf("messmenu").playground, true);
    const pid = (db.prepare("SELECT id FROM projects WHERE name = 'playground-messmenu'").get() as { id: number }).id;
    db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, 42, 7, ?)").run(pid, new Date().toISOString());
    pg.startNow("messmenu");
    await pg.settle();
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n, 0);
    // A job queued for it anyway (as an intake would) is skipped.
    const inc = (db.prepare("SELECT id FROM incidents WHERE project_id = ?").get(pid) as { id: number }).id;
    const evId = (db.prepare("SELECT event_id FROM events WHERE incident_id = ?").get(inc) as { event_id: string }).event_id;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO jobs (kind, incident_id, payload, created_at, updated_at) VALUES ('incident', ?, ?, ?, ?)").run(inc, JSON.stringify({ change: "new", event_id: evId, session: null }), now, now);
    const worker = new Worker(db, ai, tg, null, phone);
    worker.start();
    for (let i = 0; i < 60; i++) {
      if ((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued', 'running')").get() as { n: number }).n === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    worker.stop();
    assert.deepEqual(sent, []);
    assert.deepEqual(rang, []);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM alerts").get() as { n: number }).n, 0);
    pg.stop();
  });
});

describe("playground routes", () => {
  const db = openDb(":memory:");
  const pg = new Playground(db, null, { dir, canSpend: () => false });
  const app = playgroundRoutes(pg, []);
  const post = (body: string, ip = "1.1.1.1") => app.request("/public/playground/watch", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body });

  it("lists the live apps and the latest runs", async () => {
    const apps = (await (await app.request("/public/playground/apps")).json()) as { apps: Array<{ name: string; files: number; stack: string }> };
    assert.equal(apps.apps[0].name, "messmenu");
    assert.equal(apps.apps[0].stack, "Python");
    assert.ok(apps.apps[0].files > 5);
    const latest = (await (await app.request("/public/playground/latest")).json()) as { runs: unknown[] };
    assert.deepEqual(latest.runs, []);
  });

  it("accepts only an app from the list", async () => {
    for (const body of ["null", "[]", '{"session":"aaaaaaaaaa","app":"__proto__"}', '{"session":"aaaaaaaaaa","app":"../apps"}', '{"session":"aaaaaaaaaa","app":["messmenu"]}', '{"session":"x","app":"messmenu"}']) {
      assert.equal((await post(body)).status, 400, body);
    }
    assert.equal((await app.request("/public/playground/feed/__proto__")).status, 400);
    const ok = await post('{"session":"aaaaaaaaaa","app":"messmenu","open":true}');
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { started: unknown }).started, null, "no budget and no past run: nothing starts");
  });

  it("limits each session to 20 watches a minute and each address to 120 an hour", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await post('{"session":"bbbbbbbbbb","app":"messmenu"}', "2.2.2.2")).status;
    assert.equal(last, 429);
    for (let i = 0; i < 120; i++) await post(`{"session":"s${String(i).padStart(9, "0")}","app":"messmenu"}`, "3.3.3.3");
    assert.equal((await post('{"session":"zzzzzzzzzz","app":"messmenu"}', "3.3.3.3")).status, 429);
    assert.equal((await post('{"session":"zzzzzzzzzz","app":"messmenu"}', "4.4.4.4")).status, 200, "another address is not affected");
  });
});

describe("a visitor's own run: pick the bug, use the app, approve, undo", () => {
  const S1 = "visitor-one-123";
  const S2 = "visitor-two-456";
  const until = async (f: () => boolean) => {
    for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 25));
  };

  it("accepts only listed apps and bugs", () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    assert.deepEqual(pg.startOwn({ session: S1, caseId: "ledgerly-gst-float", exam: false, heal: "ask" }, "messmenu"), { error: "case" });
    assert.deepEqual(pg.startOwn({ session: S1, caseId: CASE_ID, exam: false, heal: "ask" }, "../apps"), { error: "app" });
    assert.deepEqual(pg.startOwn({ session: S1, caseId: "__proto__", exam: false, heal: "ask" }, "messmenu"), { error: "case" });
    assert.equal(pg.caseList("messmenu")[0].id, CASE_ID);
    pg.stop();
  });

  it("broken, then approved: the hidden test passes and the app answers; undo breaks it again", async () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    const steps: string[] = [];
    const on = (ev: PlaygroundEvent) => steps.push(ev.step);
    playgroundBus.on(`session:${S1}`, on);
    const r = pg.startOwn({ session: S1, caseId: "surprise", exam: false, heal: "ask" }, "messmenu");
    assert.ok("run_id" in r);
    assert.deepEqual(pg.startOwn({ session: S1, caseId: CASE_ID, exam: false, heal: "ask" }, "messmenu"), { error: "busy" });
    await pg.settle();
    const id = (r as { run_id: number }).run_id;
    assert.equal(pg.ownRun(S2, id), null, "another visitor cannot reach it");
    const o = pg.ownRun(S1, id)!;
    assert.equal(o.state, "broken");
    assert.equal(o.approvable, true);
    assert.equal(pg.latest(1)[0].hidden_test, "not_run", "the hidden test waits for the visitor");
    const before = await pg.use(o);
    assert.equal(before.answered, false);
    assert.match(before.error ?? "", /KeyError/);
    assert.equal(await pg.applyFix(o, "approved"), "applied");
    assert.equal(o.state, "fixed");
    assert.equal(pg.latest(1)[0].hidden_test, "passed");
    assert.equal(pg.latest(1)[0].applied_by, "approved");
    const after = await pg.use(o);
    assert.equal(after.answered, true);
    assert.deepEqual(after.response, { status: 400, error: "missing: plates" });
    assert.equal(pg.undo(o), true);
    assert.equal((await pg.use(o)).answered, false, "undo puts the bug back");
    playgroundBus.off(`session:${S1}`, on);
    for (const s of ["plant", "crash", "decision", "cause", "gate", "own_test", "ready", "done", "used_crash", "applied", "hidden_test", "used_ok", "undone"]) assert.ok(steps.includes(s), s);
    pg.stop();
  });

  it("heal on its own applies a proved, recommended fix without a click", async () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    const r = pg.startOwn({ session: S2, caseId: CASE_ID, exam: true, heal: "auto" }, "messmenu") as { run_id: number };
    await pg.settle();
    await until(() => pg.ownRun(S2, r.run_id)?.state === "fixed");
    assert.equal(pg.ownRun(S2, r.run_id)!.state, "fixed");
    assert.equal(pg.latest(1)[0].applied_by, "healed");
    pg.stop();
  });

  it("routes: only your own run, only listed bugs, rate-limited", async () => {
    const db = openDb(":memory:");
    const { ai } = fakeAI(db);
    const pg = new Playground(db, ai, { dir, canSpend: () => true });
    const app = playgroundRoutes(pg, []);
    const post = (path: string, body: unknown, ip = "7.7.7.7") => app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
    assert.equal((await post("/public/playground/run", { session: S1, app: "messmenu", case: "ledgerly-gst-float" })).status, 400);
    assert.equal((await post("/public/playground/run", { session: S1, app: "messmenu", case: CASE_ID, heal: "rm -rf" })).status, 400);
    const started = await post("/public/playground/run", { session: S1, app: "messmenu", case: CASE_ID });
    assert.equal(started.status, 200);
    const id = ((await started.json()) as { run_id: number }).run_id;
    await pg.settle();
    assert.equal((await post("/public/playground/approve", { session: S2, run_id: id }, "8.8.8.8")).status, 403, "cannot approve someone else's run");
    assert.equal((await post("/public/playground/use", { session: S2, run_id: id }, "8.8.8.8")).status, 403);
    assert.equal((await post("/public/playground/undo", { session: S2, run_id: id }, "8.8.8.8")).status, 403);
    assert.equal((await post("/public/playground/approve", { session: S1, run_id: id })).status, 200);
    assert.equal((await post("/public/playground/approve", { session: S1, run_id: id })).status, 409, "already applied");
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await post("/public/playground/undo", { session: S1, run_id: id })).status;
    assert.equal(last, 429, "approve/undo are rate-limited per visitor");
    const apps = (await (await app.request("/public/playground/apps")).json()) as { apps: Array<{ cases: Array<{ id: string; title: string }> }> };
    assert.equal(apps.apps[0].cases[0].id, CASE_ID);
    pg.stop();
  });
});
