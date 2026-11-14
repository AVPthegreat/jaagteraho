// Runs every Live playground bug once, end to end, exactly as a visitor gets it, with the real model:
// plant -> crash -> decision -> cause -> gate -> (approve) -> our hidden test -> Use (real answer) -> Undo -> Use (500).
// Same code path as the HTTP flow (Playground.startOwn / applyFix / use / undo, the isolated runner via
// JR_RUNNER_SOCKET), without the HTTP rate limits. It writes only to its OWN database file and its output
// folder: no playground_runs rows, spend rows or anything else of the live watcher is touched.
//
// Run inside the watcher container (where the runner socket and the model key are):
//   node --import tsx scripts/playground-e2e.ts [--out /data/playground-e2e] [--only ledgerly] [--budget 1.5] [--concurrency 3]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeAI } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import type { PlaygroundEvent } from "../src/playground/events.js";
import { playgroundBus } from "../src/playground/events.js";
import { Playground } from "../src/playground/runner.js";
import { runnerMode } from "../src/runner/client.js";

const args = process.argv.slice(2);
const arg = (name: string, d: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const OUT = arg("--out", "/data/playground-e2e");
const ONLY = args.includes("--only") ? arg("--only", "") : null;
const BUDGET = Number(arg("--budget", "1.5"));
const CONCURRENCY = Math.max(1, Math.min(3, Number(arg("--concurrency", "3"))));

if (!runnerMode()) throw new Error("No isolated runner: set JR_RUNNER_SOCKET (inside the watcher container it is set).");
mkdirSync(OUT, { recursive: true });
const db = openDb(join(OUT, "e2e.db")); // its own ledger: the live watcher's database is never opened
const ai = makeAI(db);
if (!ai) throw new Error("JR_ANTHROPIC_API_KEY is not set");
const spent = () => ai.guard.total();
const pg = new Playground(db, ai, { canSpend: () => spent() < BUDGET, maxConcurrent: CONCURRENCY, runsPerHour: 600, cleanTemp: false });
pg.stop(); // no ticker: only the runs started here

type Row = {
  case_id: string; app: string; title: string; source: string; decision: string | null; cause_file_right: boolean | null; gate: string | null; gate_reason: string | null;
  protected_files: string[]; appliable_in_copy: boolean | null; not_appliable_reason: string | null; use_before: string | null; hidden_test: string | null;
  use_after_fix: string | null; undo_restores_500: boolean | null; seconds: number; cost_usd: number; error: string | null;
};

const describeUse = (u: Awaited<ReturnType<Playground["use"]>>) =>
  u === "busy" ? "busy" : u.answered ? `answered ${typeof u.response === "object" && u.response && "status" in u.response ? (u.response as { status: unknown }).status : "ok"}` : "500 crashed";

async function one(caseId: string, app: string, i: number): Promise<Row> {
  const session = `e2e-${i.toString().padStart(4, "0")}-${Date.now().toString(36)}`;
  const info = pg.caseList(app).find((c) => c.id === caseId)!;
  const events: PlaygroundEvent[] = [];
  const on = (ev: PlaygroundEvent) => events.push(ev);
  playgroundBus.on(`session:${session}`, on);
  const t0 = Date.now();
  const before = spent();
  const row: Row = {
    case_id: caseId, app, title: info.title, source: info.source, decision: null, cause_file_right: null, gate: null, gate_reason: null, protected_files: [],
    appliable_in_copy: null, not_appliable_reason: null, use_before: null, hidden_test: null, use_after_fix: null, undo_restores_500: null, seconds: 0, cost_usd: 0, error: null,
  };
  try {
    if (spent() >= BUDGET) throw new Error("budget reached before this case");
    const r = pg.startOwn({ session, caseId, exam: false, heal: "ask" }, app);
    if ("error" in r) throw new Error(`could not start: ${r.error}`);
    for (let w = 0; w < 600 && pg.ownRun(session, r.run_id)?.state === "running"; w++) await new Promise((res) => setTimeout(res, 500));
    const o = pg.ownRun(session, r.run_id);
    if (!o || o.state === "running") throw new Error("the run did not finish in 5 minutes");
    const step = (s: string) => events.find((e) => e.step === s)?.data;
    row.decision = (step("decision")?.action as string) ?? null;
    row.gate = (step("gate")?.level as string) ?? null;
    row.gate_reason = ((step("gate")?.reasons as string[] | undefined) ?? [])[0] ?? null;
    row.protected_files = (step("gate")?.protected_files as string[] | undefined) ?? [];
    row.appliable_in_copy = o.approvable;
    row.not_appliable_reason = o.approvable ? null : ((step("ready")?.reason as string) ?? (step("cause")?.unavailable as string) ?? null);
    row.cause_file_right = o.card?.right_file ?? null;
    row.use_before = describeUse(await pg.use(o));
    if (o.approvable) {
      await pg.applyFix(o, "approved");
      row.hidden_test = pg.ownRun(session, r.run_id)?.card?.hidden_test ?? null;
      row.use_after_fix = describeUse(await pg.use(o));
      pg.undo(o);
      row.undo_restores_500 = describeUse(await pg.use(o)) === "500 crashed";
    }
  } catch (e) {
    row.error = String(e).slice(0, 200);
  } finally {
    playgroundBus.off(`session:${session}`, on);
    row.seconds = Math.round((Date.now() - t0) / 100) / 10;
    row.cost_usd = Math.round((spent() - before) * 10000) / 10000; // approximate when runs overlap; the total is exact
  }
  console.log(`${row.case_id.padEnd(40)} ${String(row.decision).padEnd(7)} gate ${String(row.gate).padEnd(11)} appliable ${row.appliable_in_copy} hidden ${row.hidden_test} use ${row.use_after_fix} undo ${row.undo_restores_500}${row.error ? ` ERROR ${row.error}` : ""}`);
  return row;
}

const todo = pg.apps.filter((a) => !ONLY || a.name === ONLY).flatMap((a) => pg.casesFor(a.name).map((c) => ({ id: c.id, app: a.name })));
const rows: Row[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const i = next++;
      rows[i] = await one(todo[i].id, todo[i].app, i);
    }
  }),
);

const yes = (b: boolean | null) => (b === null ? "–" : b ? "yes" : "no");
const md = [
  "# Live playground: every bug, end to end",
  "",
  `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC with the real model and the isolated runner. ${rows.length} bugs, total cost $${spent().toFixed(3)}.`,
  "",
  `| Measure | Result |`,
  `|---|---|`,
  `| Fix appliable in the visitor's copy | ${rows.filter((r) => r.appliable_in_copy).length} of ${rows.length} |`,
  `| Approved fix passed our hidden test | ${rows.filter((r) => r.hidden_test === "passed").length} of ${rows.filter((r) => r.appliable_in_copy).length} |`,
  `| Use after the fix got a real answer | ${rows.filter((r) => r.use_after_fix?.startsWith("answered")).length} |`,
  `| Undo brought the 500 back | ${rows.filter((r) => r.undo_restores_500).length} |`,
  `| Right file named | ${rows.filter((r) => r.cause_file_right).length} of ${rows.length} |`,
  `| Errors | ${rows.filter((r) => r.error).length} |`,
  "",
  "| Case | App | Bug | Decision | Right file | Gate (reason) | Appliable in copy (why not) | Hidden test | Use after fix | Undo → 500 | s | $ |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.case_id} | ${r.app} | ${r.title.replaceAll("|", "/")} | ${r.decision ?? "–"} | ${yes(r.cause_file_right)} | ${r.gate ?? "–"}${r.gate_reason ? ` (${r.gate_reason.replaceAll("|", "/")})` : ""}${r.protected_files.length ? " · protected" : ""} | ${yes(r.appliable_in_copy)}${r.not_appliable_reason ? ` (${r.not_appliable_reason.replaceAll("|", "/")})` : ""}${r.error ? ` ERROR: ${r.error.replaceAll("|", "/")}` : ""} | ${r.hidden_test ?? "–"} | ${r.use_after_fix ?? "–"} | ${yes(r.undo_restores_500)} | ${r.seconds} | ${r.cost_usd} |`,
  ),
].join("\n");
writeFileSync(join(OUT, "playground-e2e.json"), JSON.stringify({ at: new Date().toISOString(), total_cost_usd: spent(), rows }, null, 2));
writeFileSync(join(OUT, "playground-e2e.md"), `${md}\n`);
console.log(`\nWrote ${join(OUT, "playground-e2e.md")} and .json · total $${spent().toFixed(3)}`);
process.exit(0);
