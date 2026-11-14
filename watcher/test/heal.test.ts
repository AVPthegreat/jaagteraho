// Self-healing: the owner's rule, the fixed safety rules, caps, rollback when errors don't drop, and undo.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb, type DB } from "../src/db/db.js";
import {
  DEFAULT_POLICY, GRACE_MS, WATCH_MS, Healer, healBlocker, normalisePolicy, notImproved, parseHealArgs, policyOf, reverseEdits, savePolicy,
  type GitHubOps, type HealFacts,
} from "../src/pipeline/heal.js";
import type { Telegram } from "../src/telegram/api.js";

const iso = (ms: number) => new Date(ms).toISOString();

function facts(over: Partial<HealFacts> = {}): HealFacts {
  return {
    policy: normalisePolicy({ mode: "auto-now" }),
    trigger: "auto-now",
    kind: "faurus",
    route: "/api/submit",
    incident_status: "open",
    owner_paused: false,
    fix_status: "shown",
    gate: { passed: true, level: "recommended", test_run: null },
    files: ["portal/submissions.py"],
    heals_last_night: 0,
    now: Date.now(),
    ...over,
  };
}

describe("heal policy", () => {
  it("defaults to the owner approving every fix", () => {
    assert.equal(DEFAULT_POLICY.mode, "ask");
    assert.equal(normalisePolicy({}).mode, "ask");
    assert.equal(normalisePolicy({ mode: "nonsense" as never, after_min: 9999, max_per_night: 0 }).after_min, 240);
    assert.equal(normalisePolicy({ max_per_night: 0 }).max_per_night, 1);
  });

  it("parses /heal words", () => {
    assert.equal(parseHealArgs([]), "show");
    assert.deepEqual(parseHealArgs(["off"]), { patch: { mode: "off", suspended_until: null, suspended_reason: null } });
    assert.equal((parseHealArgs(["auto"]) as { patch: { after_min: number } }).patch.after_min, 10);
    assert.deepEqual((parseHealArgs(["auto", "25m"]) as { patch: object }).patch, { mode: "auto-after", after_min: 25, suspended_until: null, suspended_reason: null });
    assert.ok("error" in (parseHealArgs(["auto", "1m"]) as object));
    assert.deepEqual((parseHealArgs(["now", "/api/submit"]) as { patch: { flows: string[] } }).patch.flows, ["/api/submit"]);
    assert.ok("error" in (parseHealArgs(["now", "api"]) as object));
    assert.deepEqual(parseHealArgs(["max", "3"]), { patch: { max_per_night: 3 } });
    assert.ok("error" in (parseHealArgs(["max", "9"]) as object));
    assert.ok("error" in (parseHealArgs(["yolo"]) as object));
  });
});

describe("heal rules", () => {
  it("lets a recommended fix heal under an auto rule", () => assert.equal(healBlocker(facts()), null));

  it("never heals on its own under ask or off", () => {
    assert.match(healBlocker(facts({ policy: normalisePolicy({ mode: "ask" }) }))!, /approve every fix/);
    assert.match(healBlocker(facts({ policy: normalisePolicy({ mode: "off" }) }))!, /approve every fix/);
    assert.match(healBlocker(facts({ policy: normalisePolicy({ mode: "auto-after" }), trigger: "auto-now" }))!, /waits for you/);
  });

  it("auto-now only on the routes chosen", () => {
    const p = normalisePolicy({ mode: "auto-now", flows: ["/api/exam"] });
    assert.match(healBlocker(facts({ policy: p }))!, /not one you chose/);
    assert.equal(healBlocker(facts({ policy: p, route: "/api/exam/start" })), null);
  });

  it("only recommended fixes: caution and withheld never auto-apply", () => {
    assert.match(healBlocker(facts({ gate: { passed: true, level: "caution" } }))!, /concerns/);
    assert.match(healBlocker(facts({ fix_status: "rejected", gate: { passed: false, level: "withheld" } }))!, /withheld/);
    assert.match(healBlocker(facts({ fix_status: "approved" }))!, /already approved/);
  });

  it("protected areas are never auto-applied, even if a gate result says recommended", () => {
    for (const f of ["accounts/auth.py", "billing/views.py", "exam/grading.py", "app/migrations/0003.py", "config/settings.py", ".github/workflows/ci.yml"]) {
      assert.match(healBlocker(facts({ files: [f] }))!, /protected area/, f);
      assert.match(healBlocker(facts({ files: [f], trigger: "owner" }))!, /protected area/, f);
    }
  });

  it("caps heals per night, pauses after a failed heal, respects /pause", () => {
    assert.match(healBlocker(facts({ heals_last_night: 2 }))!, /2 heals already/);
    assert.match(healBlocker(facts({ policy: normalisePolicy({ mode: "auto-now", suspended_until: iso(Date.now() + 60_000) }) }))!, /paused after a heal/);
    assert.equal(healBlocker(facts({ policy: normalisePolicy({ mode: "auto-now", suspended_until: iso(Date.now() - 60_000) }) })), null);
    assert.match(healBlocker(facts({ owner_paused: true }))!, /paused JaagteRaho/);
  });

  it("the demo portal needs a proving regression test", () => {
    assert.match(healBlocker(facts({ kind: "sandbox" }))!, /test did not prove/);
    assert.equal(healBlocker(facts({ kind: "sandbox", gate: { passed: true, level: "recommended", test_run: { verdict: "proved" } } })), null);
  });

  it("the owner's own approval skips the auto rule, never the safety rules", () => {
    assert.equal(healBlocker(facts({ trigger: "owner", policy: normalisePolicy({ mode: "ask" }), heals_last_night: 9 })), null);
    assert.match(healBlocker(facts({ trigger: "owner", gate: { passed: true, level: "caution" } }))!, /concerns/);
  });

  it("judges improvement and reverses edits", () => {
    assert.equal(notImproved(10, 0), false);
    assert.equal(notImproved(10, 3), false);
    assert.equal(notImproved(10, 5), true);
    assert.equal(notImproved(0, 1), true);
    assert.deepEqual(reverseEdits([{ file: "a.py", find: "x", replace: "y" }]), [{ file: "a.py", find: "y", replace: "x" }]);
  });
});

// ---------- the healer, with stand-in GitHub, Telegram and portal ----------

function fakeTg() {
  const sent: Array<{ text: string; markup?: unknown }> = [];
  const tg = { send: async (_c: number, text: string, markup?: unknown) => (sent.push({ text, markup }), { message_id: 1, chat: { id: 1, type: "private" } }) } as unknown as Telegram;
  return { tg, sent };
}

function fakeGitHub(opts: { autoMerge?: "on" | "clean" | "refused" } = {}) {
  const calls: string[] = [];
  const prs = new Map<number, { merged_at: string | null; state: string; edits: unknown }>();
  let n = 40;
  const github: GitHubOps = {
    openPr: async (o) => {
      const num = ++n;
      prs.set(num, { merged_at: null, state: "open", edits: o.edits });
      calls.push(`open:${num}:${o.title}`);
      return { ok: true, url: `https://github.com/acme/app/pull/${num}`, number: num };
    },
    autoMerge: async (_r, _t, num) => {
      calls.push(`automerge:${num}`);
      if (opts.autoMerge === "refused") return { ok: false, error: "auto-merge is not allowed for this repository" };
      if (opts.autoMerge === "clean") {
        prs.get(num)!.merged_at = iso(Date.now());
        return { ok: true, merged: true };
      }
      return { ok: true, merged: false };
    },
    state: async (_r, _t, num) => prs.get(num) ?? null,
    close: async (_r, _t, num) => (calls.push(`close:${num}`), (prs.get(num)!.state = "closed"), true),
  };
  return { github, calls, prs };
}

const EDIT = { file: "portal/submissions.py", find: '    language = data["language"]', replace: '    language = data.get("language", "python")' };

function seed(db: DB, o: { kind?: "faurus" | "sandbox"; level?: string; proved?: boolean; file?: string; action?: string; wokeAgoMs?: number; acked?: number; repo?: string | null } = {}) {
  const now = Date.now();
  const kind = o.kind ?? "faurus";
  const pid = 1000 + Math.floor(Math.random() * 1e6);
  db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, settings, created_at) VALUES (?, ?, ?, ?, ?, '{}', ?)").run(pid, `app${pid}`, `k${pid}`, kind, o.repo === undefined ? "acme/app" : o.repo, iso(now - 86_400_000));
  db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, 7, 7, ?)").run(pid, iso(now));
  const inc = Number(
    db.prepare("INSERT INTO incidents (project_id, fingerprint, exception_type, transaction_name, first_seen, last_seen, hits) VALUES (?, 'fp', 'KeyError', '/api/submit', ?, ?, 4)").run(pid, iso(now - 600_000), iso(now)).lastInsertRowid,
  );
  for (let i = 0; i < 4; i++) addEvent(db, pid, inc, now - (i + 1) * 60_000);
  const woke = iso(now - (o.wokeAgoMs ?? 0));
  db.prepare("INSERT INTO decisions (incident_id, facts, votes, rule_number, rule_text, action, engine, created_at) VALUES (?, '{}', '{}', 2, 'critical', ?, 'claude', ?)").run(inc, o.action ?? "wake", woke);
  db.prepare("INSERT INTO alerts (incident_id, chat_id, message_id, action, acked, pings, last_ping_at) VALUES (?, 7, 55, ?, ?, 3, ?)").run(inc, o.action ?? "wake", o.acked ?? 0, woke);
  const result = { cause_plain: "No language is sent.", cause_technical: "t", file: EDIT.file, line: 14, confidence_words: "sure", test_hint: "h", edits: [{ ...EDIT, file: o.file ?? EDIT.file }] };
  const d = Number(db.prepare("INSERT INTO diagnoses (incident_id, model, result, created_at) VALUES (?, 'm', ?, ?)").run(inc, JSON.stringify(result), iso(now)).lastInsertRowid);
  const gate = { passed: true, level: o.level ?? "recommended", reasons: [], changed_lines: 2, test_run: o.proved ? { verdict: "proved", note: "ok" } : null };
  const fix = Number(db.prepare("INSERT INTO fixes (diagnosis_id, diff, gate_result, status, created_at) VALUES (?, '--- a\n+++ b', ?, 'shown', ?)").run(d, JSON.stringify(gate), iso(now)).lastInsertRowid);
  process.env[`JR_GITHUB_HEAL_TOKEN_${pid}`] = "test-token";
  return { pid, inc, fix };
}

let evN = 0;
function addEvent(db: DB, pid: number, inc: number, at: number) {
  db.prepare(
    "INSERT INTO events (event_id, project_id, incident_id, received_at, occurred_at, level, exception_type, message_masked, frames, tags) VALUES (?, ?, ?, ?, ?, 'error', 'KeyError', 'm', '[]', '{}')",
  ).run(`e${++evN}`, pid, inc, iso(at), iso(at));
}

describe("healer: real apps", () => {
  it("under ask, nothing happens on its own", async () => {
    const db = openDb(":memory:");
    const { tg, sent } = fakeTg();
    const { github, calls } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const s = seed(db);
    assert.equal(policyOf(db, s.pid).mode, "ask");
    assert.equal(await h.onFix(s.inc, { session: null, action: "wake" }), null);
    await h.tick();
    assert.equal(calls.length, 0);
    assert.equal(sent.length, 0);
  });

  it("auto-now opens a PR with auto-merge, reports when merged, confirms when the error stops", async () => {
    const db = openDb(":memory:");
    const { tg, sent } = fakeTg();
    const { github, calls, prs } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const s = seed(db);
    savePolicy(db, s.pid, { mode: "auto-now" });
    const row = await h.onFix(s.inc, { session: null, action: "wake" });
    assert.equal(row?.status, "merging");
    assert.deepEqual(calls.map((c) => c.split(":")[0]), ["open", "automerge"]);
    assert.match(calls[0], /Fix KeyError on \/api\/submit/);
    assert.equal((db.prepare("SELECT status FROM fixes WHERE id = ?").get(s.fix) as { status: string }).status, "approved");
    // A second trigger cannot open a second PR.
    assert.equal(await h.onFix(s.inc, { session: null, action: "wake" }), null);

    const merged = Date.now();
    prs.get(row!.pr_number!)!.merged_at = iso(merged);
    await h.tick(merged + 1000);
    assert.equal(h.get(row!.id)!.status, "applied");
    const report = sent.find((m) => m.text.includes("Healed while you were away"));
    assert.ok(report, "owner gets the healed report");
    assert.match(report!.text, /What broke:.*What I changed:.*Proof:/s);
    assert.deepEqual(report!.markup, { inline_keyboard: [[{ text: "Undo", callback_data: `u:${row!.id}` }]] });

    await h.tick(merged + GRACE_MS + WATCH_MS + 1000);
    assert.equal(h.get(row!.id)!.status, "verified");
    assert.ok(sent.some((m) => m.text.includes("Heal confirmed")));
    assert.equal((db.prepare("SELECT status FROM fixes WHERE id = ?").get(s.fix) as { status: string }).status, "merged");
  });

  it("rolls back, wakes the owner again and pauses self-healing when the errors don't drop", async () => {
    const db = openDb(":memory:");
    const { tg, sent } = fakeTg();
    const { github, calls } = fakeGitHub({ autoMerge: "clean" });
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const s = seed(db);
    savePolicy(db, s.pid, { mode: "auto-now" });
    const row = await h.onFix(s.inc, { session: null, action: "wake" });
    assert.equal(row?.status, "applied");
    const applied = Date.parse(row!.applied_at!);
    for (let i = 0; i < 4; i++) addEvent(db, s.pid, s.inc, applied + GRACE_MS + 60_000 + i * 1000);
    await h.tick(applied + GRACE_MS + 5 * 60_000);
    const after = h.get(row!.id)!;
    assert.equal(after.status, "rolled_back");
    assert.ok(calls.some((c) => c.startsWith("open:") && c.includes("Undo JaagteRaho fix")), "a revert PR is opened");
    assert.ok(sent.some((m) => m.text.includes("WAKE · the heal did not help")));
    const alert = db.prepare("SELECT pings, acked, action FROM alerts WHERE incident_id = ?").get(s.inc) as { pings: number; acked: number; action: string };
    assert.deepEqual(alert, { pings: 0, acked: 0, action: "wake" }, "paging starts again");
    const p = policyOf(db, s.pid);
    assert.ok(p.suspended_until && Date.parse(p.suspended_until) > Date.now());
    // While paused, the next incident does not heal on its own.
    const s2 = seed(db);
    savePolicy(db, s2.pid, { mode: "auto-now" });
    assert.ok(policyOf(db, s.pid).suspended_until);
    assert.equal(h.check(s2.fix, "auto-now", null).blocker, null, "another app is unaffected");
  });

  it("auto-after waits for the owner's minutes on an unacknowledged wake-up", async () => {
    const db = openDb(":memory:");
    const { tg } = fakeTg();
    const { github, calls } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const fresh = seed(db, { wokeAgoMs: 2 * 60_000 });
    savePolicy(db, fresh.pid, { mode: "auto-after", after_min: 10 });
    const acked = seed(db, { wokeAgoMs: 30 * 60_000, acked: 1 });
    savePolicy(db, acked.pid, { mode: "auto-after", after_min: 10 });
    const late = seed(db, { wokeAgoMs: 11 * 60_000 });
    savePolicy(db, late.pid, { mode: "auto-after", after_min: 10 });
    assert.equal(await h.onFix(late.inc, { session: null, action: "wake" }), null, "auto-after never applies at once");
    await h.tick();
    assert.equal(calls.filter((c) => c.startsWith("open:")).length, 1);
    assert.equal(h.latestFor(late.inc)?.trigger, "auto-after");
    assert.equal(h.latestFor(fresh.inc), undefined);
    assert.equal(h.latestFor(acked.inc), undefined);
  });

  it("protected areas and caution fixes are reported, never applied", async () => {
    const db = openDb(":memory:");
    const { tg, sent } = fakeTg();
    const { github, calls } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const prot = seed(db, { file: "billing/payment.py", wokeAgoMs: 20 * 60_000 });
    savePolicy(db, prot.pid, { mode: "auto-after" });
    const care = seed(db, { level: "caution", wokeAgoMs: 20 * 60_000 });
    savePolicy(db, care.pid, { mode: "auto-after" });
    await h.tick();
    assert.equal(calls.length, 0);
    assert.equal(h.latestFor(prot.inc)?.status, "skipped");
    assert.match(h.latestFor(prot.inc)!.detail!, /protected area/);
    assert.match(h.latestFor(care.inc)!.detail!, /concerns/);
    assert.equal(sent.filter((m) => m.text.includes("Not healing on its own")).length, 2);
    await h.tick();
    assert.equal(sent.filter((m) => m.text.includes("Not healing on its own")).length, 2, "told once");
  });

  it("caps heals per app per night", async () => {
    const db = openDb(":memory:");
    const { tg } = fakeTg();
    const { github } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const a = seed(db);
    savePolicy(db, a.pid, { mode: "auto-now", max_per_night: 2 });
    // Two more incidents on the same app.
    const mk = () => {
      const inc = Number(db.prepare("INSERT INTO incidents (project_id, fingerprint, exception_type, transaction_name, first_seen, last_seen) VALUES (?, ?, 'E', '/x', ?, ?)").run(a.pid, `f${Math.random()}`, iso(Date.now()), iso(Date.now())).lastInsertRowid);
      const d = Number(db.prepare("INSERT INTO diagnoses (incident_id, model, result, created_at) VALUES (?, 'm', ?, ?)").run(inc, JSON.stringify({ edits: [EDIT], cause_plain: "c", cause_technical: "t", test_hint: "h", file: "f", line: 1 }), iso(Date.now())).lastInsertRowid);
      db.prepare("INSERT INTO fixes (diagnosis_id, diff, gate_result, status, created_at) VALUES (?, 'd', ?, 'shown', ?)").run(d, JSON.stringify({ passed: true, level: "recommended", reasons: [] }), iso(Date.now()));
      return inc;
    };
    assert.equal((await h.onFix(a.inc, { session: null, action: "wake" }))?.status, "merging");
    assert.equal((await h.onFix(mk(), { session: null, action: "notify" }))?.status, "merging");
    assert.equal(await h.onFix(mk(), { session: null, action: "wake" }), null, "third heal in 12 hours is held");
  });

  it("without write access sends the diff and keeps paging", async () => {
    const db = openDb(":memory:");
    const { tg, sent } = fakeTg();
    const { github, calls } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const s = seed(db);
    delete process.env[`JR_GITHUB_HEAL_TOKEN_${s.pid}`];
    savePolicy(db, s.pid, { mode: "auto-now" });
    const row = await h.onFix(s.inc, { session: null, action: "wake" });
    assert.equal(row?.status, "diff_sent");
    assert.equal(calls.length, 0);
    assert.ok(sent.some((m) => m.text.includes("can't write") && m.text.includes("<pre>")));
    assert.equal((db.prepare("SELECT pings FROM alerts WHERE incident_id = ?").get(s.inc) as { pings: number }).pings, 0);
  });

  it("when the repository refuses auto-merge, the PR stays for the owner and paging goes on", async () => {
    const db = openDb(":memory:");
    const { tg, sent } = fakeTg();
    const { github } = fakeGitHub({ autoMerge: "refused" });
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const s = seed(db);
    savePolicy(db, s.pid, { mode: "auto-now" });
    const row = await h.onFix(s.inc, { session: null, action: "wake" });
    assert.equal(row?.status, "pr_open");
    assert.ok(sent.some((m) => m.text.includes("merge it yourself")));
  });

  it("Undo before the merge closes the PR; after the merge opens a revert", async () => {
    const db = openDb(":memory:");
    const { tg } = fakeTg();
    const { github, calls, prs } = fakeGitHub();
    const h = new Healer(db, tg, { twinFixed: "http://x", github });
    const s = seed(db);
    savePolicy(db, s.pid, { mode: "auto-now" });
    const row = await h.onFix(s.inc, { session: null, action: "wake" });
    assert.match(await h.undo(row!.id, "owner"), /Closed the pull request/);
    assert.ok(calls.includes(`close:${row!.pr_number}`));
    assert.equal(h.get(row!.id)!.status, "undone");
    assert.equal((db.prepare("SELECT status FROM fixes WHERE id = ?").get(s.fix) as { status: string }).status, "shown");

    const s2 = seed(db);
    savePolicy(db, s2.pid, { mode: "auto-now" });
    const r2 = await h.onFix(s2.inc, { session: null, action: "wake" });
    prs.get(r2!.pr_number!)!.merged_at = iso(Date.now());
    await h.tick();
    assert.match(await h.undo(r2!.id, "owner"), /Undo pull request/);
    assert.equal(h.get(r2!.id)!.status, "undone");
    assert.match(await h.undo(r2!.id, "owner"), /Nothing to undo/);
  });
});

describe("healer: demo portal", () => {
  const portal = (status: number) => (async () => new Response(JSON.stringify(status < 500 ? { ok: true } : { error: "boom" }), { status })) as unknown as typeof fetch;

  it("a visitor who chose 'heal on its own' gets a proved fix applied and re-checked", async () => {
    const db = openDb(":memory:");
    const h = new Healer(db, null, { twinFixed: "http://fixed", fetch: portal(200) });
    const s = seed(db, { kind: "sandbox", proved: true });
    Healer.setSessionMode(db, "visitor-abc123", true);
    const row = await h.onFix(s.inc, { session: "visitor-abc123", action: "wake" });
    assert.equal(row?.status, "verified");
    assert.match(row!.detail!, /answers 200/);
    assert.ok(db.prepare("SELECT 1 FROM session_fixes WHERE session_id = ? AND flow = 'submit'").get("visitor-abc123"));
    assert.equal(h.undoSession(row!.id, "someone-else-99"), false, "only the visitor's own session");
    assert.equal(h.undoSession(row!.id, "visitor-abc123"), true);
    assert.equal(db.prepare("SELECT 1 FROM session_fixes WHERE session_id = ?").get("visitor-abc123"), undefined);
  });

  it("rolls back at once when the re-check still fails", async () => {
    const db = openDb(":memory:");
    const h = new Healer(db, null, { twinFixed: "http://fixed", fetch: portal(500) });
    const s = seed(db, { kind: "sandbox", proved: true });
    Healer.setSessionMode(db, "visitor-def456", true);
    const row = await h.onFix(s.inc, { session: "visitor-def456", action: "wake" });
    assert.equal(row?.status, "rolled_back");
    assert.equal(db.prepare("SELECT 1 FROM session_fixes WHERE session_id = ?").get("visitor-def456"), undefined);
  });

  it("does nothing for a visitor who approves fixes themselves, and refuses unproved fixes", async () => {
    const db = openDb(":memory:");
    const h = new Healer(db, null, { twinFixed: "http://fixed", fetch: portal(200) });
    const s = seed(db, { kind: "sandbox", proved: true });
    Healer.setSessionMode(db, "visitor-ask0001", false);
    assert.equal(await h.onFix(s.inc, { session: "visitor-ask0001", action: "wake" }), null);
    const u = seed(db, { kind: "sandbox", proved: false });
    Healer.setSessionMode(db, "visitor-auto002", true);
    const row = await h.onFix(u.inc, { session: "visitor-auto002", action: "wake" });
    assert.equal(row?.status, "skipped");
    assert.match(row!.detail!, /did not prove/);
  });
});

describe("alert card", () => {
  it("shows Approve on a real app only with write access, and Undo plus the heal line after a heal", async () => {
    const { renderCard } = await import("../src/telegram/card.js");
    const db = openDb(":memory:");
    const { github } = fakeGitHub();
    const h = new Healer(db, null, { twinFixed: "http://x", github });
    const s = seed(db);
    const buttons = () => renderCard(db, s.inc)!.markup.inline_keyboard.flat().map((b) => b.text);
    assert.ok(buttons().includes("Approve fix"), "write access + recommended fix");
    delete process.env[`JR_GITHUB_HEAL_TOKEN_${s.pid}`];
    assert.ok(!buttons().includes("Approve fix"), "no write access: diffs only");
    process.env[`JR_GITHUB_HEAL_TOKEN_${s.pid}`] = "test-token";
    savePolicy(db, s.pid, { mode: "auto-now" });
    await h.onFix(s.inc, { session: null, action: "wake" });
    const card = renderCard(db, s.inc)!;
    assert.match(card.text, /Self-heal:<\/b> merging when your checks pass/);
    assert.ok(card.markup.inline_keyboard.flat().some((b) => b.text === "Undo"));
    assert.ok(!card.markup.inline_keyboard.flat().some((b) => b.text === "Approve fix"), "already applied");
  });
});

describe("public demo endpoints", () => {
  it("/public/break stores the visitor's heal choice; /public/undo only works on their own heal", async () => {
    const { publicRoutes } = await import("../src/web/public.js");
    const db = openDb(":memory:");
    const portal = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const healer = new Healer(db, null, { twinFixed: "http://fixed", fetch: portal });
    const app = publicRoutes({ db, voice: null, twinBroken: "http://127.0.0.1:9", twinFixed: "http://127.0.0.1:9", allowedOrigins: [], healer });
    const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await post("/public/break", { session: "visitor-zz0001", flow: "submit", heal: true }); // the portal is unreachable here; the choice is still stored
    assert.equal((db.prepare("SELECT value FROM kv WHERE key = 'heal_session:visitor-zz0001'").get() as { value: string }).value, "auto-now");
    const s = seed(db, { kind: "sandbox", proved: true });
    const row = await healer.onFix(s.inc, { session: "visitor-zz0001", action: "wake" });
    assert.equal(row?.status, "verified");
    assert.equal((await post("/public/undo", { session: "visitor-other1", heal_id: row!.id })).status, 409);
    assert.equal((await post("/public/undo", { session: "visitor-zz0001", heal_id: row!.id })).status, 200);
    assert.equal((await post("/public/undo", { session: "visitor-zz0001", heal_id: row!.id })).status, 409);
  });
});
