// JR-Bench runner: plants each bug from bench/cases.json into a copy of its sample app, makes it
// crash for real, and runs JaagteRaho's full pipeline on the resulting traceback:
//   decide (Haiku, 5 votes + rules) -> diagnose (Sonnet) -> fix gate (6 code checks + Haiku review)
//   -> the model's own regression test (proveFix) -> OUR hidden test on the patched code.
// Noise cases only go through the decision: they should never wake or notify anyone.
//
// Usage: npm run bench -- --validate      (free: checks every case is sound, no model calls)
//        npm run bench [-- --only examhall]  (full run, about $0.02 per bug case; stops at $1.50)

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeAI } from "../src/ai/claude.js";
import { openDb, type ProjectSettings } from "../src/db/db.js";
import type { CleanEvent } from "../src/intake/allowlist.js";
import { storeEvent } from "../src/intake/store.js";
import { decide } from "../src/pipeline/decide.js";
import { gatherFiles, runDiagnosis } from "../src/pipeline/diagnose.js";
import { runGate } from "../src/pipeline/gate.js";
import { proveFix } from "../src/pipeline/verify.js";
import { LocalSource } from "../src/source/source.js";
import { parseTraceback } from "../src/web/paste.js";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

type Edit = { file: string; find: string; replace: string };
type Case = {
  id: string;
  app: string;
  route: string | null;
  kind: "bug" | "noise";
  difficulty?: "in_trace" | "root_elsewhere";
  story: string;
  inject?: Edit[];
  clean_inject?: Edit[];
  trigger?: string;
  test?: string;
  traceback?: string;
};
type Bench = { apps: Record<string, { critical: Array<{ name: string; match: string }>; exam_open?: boolean; language?: "node" }>; cases: Case[] };

const BENCH = resolve(new URL("../../bench", import.meta.url).pathname);
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const validateOnly = args.includes("--validate");
const casesFile = args.includes("--cases") ? resolve(args[args.indexOf("--cases") + 1]) : join(BENCH, "cases.json");
const STOP_AT_USD = 1.5;
const PY = process.env.JR_BENCH_PYTHON ?? "python3";
const tmpDirs: string[] = [];

function copyApp(app: string, edits: Edit[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), `jrbench-${app}-`));
  tmpDirs.push(dir);
  cpSync(join(BENCH, "apps", app), dir, { recursive: true });
  for (const e of edits) {
    const path = join(dir, e.file);
    const text = readFileSync(path, "utf8");
    const n = text.split(e.find).length - 1;
    if (n !== 1) throw new Error(`${app}/${e.file}: find text occurs ${n} times`);
    writeFileSync(path, text.replace(e.find, e.replace));
  }
  return dir;
}

const isNode = (dir: string) => existsSync(join(dir, "package.json"));
const cleanEnv = { PATH: process.env.PATH ?? "", PYTHONDONTWRITEBYTECODE: "1" };

/** Runs trigger code in the app folder: Python apps with python3, Node.js apps with node. */
function py(dir: string, code: string, timeoutMs = 20_000) {
  return isNode(dir)
    ? spawnSync(process.execPath, ["-e", code], { cwd: dir, encoding: "utf8", timeout: timeoutMs, env: cleanEnv })
    : spawnSync(PY, ["-E", "-s", "-c", code], { cwd: dir, encoding: "utf8", timeout: timeoutMs, env: cleanEnv });
}

function hiddenTest(dir: string, test: string): boolean {
  const node = isNode(dir);
  const file = join(dir, node ? "jr_hidden_test.js" : "jr_hidden_test.py");
  writeFileSync(file, test);
  const r = node
    ? spawnSync(process.execPath, ["--test", file], { cwd: dir, encoding: "utf8", timeout: 20_000, env: cleanEnv })
    : spawnSync(PY, ["-E", "-s", "-m", "unittest", "jr_hidden_test"], { cwd: dir, encoding: "utf8", timeout: 20_000, env: cleanEnv });
  rmSync(file, { force: true });
  return r.status === 0;
}

/** The error report as the app would print it: a Python traceback, or a Node.js error and its stack. */
function crashReport(dir: string, stderr: string): string {
  if (!isNode(dir)) return stderr.slice(stderr.lastIndexOf("Traceback (most recent call last):"));
  const lines = stderr.split("\n");
  const head = lines.findIndex((l) => /^(?:[A-Z]\w*)?(?:Error|Exception)\b/.test(l));
  return head >= 0 ? lines.slice(head).filter((l) => !/^Node\.js v/.test(l)).join("\n").trim() : "";
}

function validate(c: Case): { ok: boolean; problems: string[]; traceback?: string } {
  if (c.kind === "noise") return { ok: !!parseTraceback(c.traceback ?? ""), problems: parseTraceback(c.traceback ?? "") ? [] : ["noise traceback does not parse"] };
  const problems: string[] = [];
  const clean = copyApp(c.app, c.clean_inject ?? []);
  const broken = copyApp(c.app, c.inject ?? []);
  if (!hiddenTest(clean, c.test!)) problems.push("hidden test fails on the clean app");
  if (hiddenTest(broken, c.test!)) problems.push("hidden test passes on the broken app");
  const run = py(broken, c.trigger!);
  const tb = crashReport(broken, run.stderr);
  if (run.status === 0 || !tb) problems.push("trigger did not crash");
  else if (!parseTraceback(tb)) problems.push("traceback does not parse");
  if (py(clean, c.trigger!).status !== 0) problems.push("trigger crashes on the clean app too");
  return { ok: problems.length === 0, problems, traceback: tb };
}

async function main() {
  const bench = JSON.parse(readFileSync(casesFile, "utf8")) as Bench;
  const cases = bench.cases.filter((c) => !only || c.app === only || c.id === only);

  console.log("Validating cases (no model calls)...");
  const valid = new Map<string, string | undefined>();
  for (const c of cases) {
    const v = validate(c);
    console.log(`${v.ok ? "ok  " : "BAD "} ${c.id}${v.problems.length ? `: ${v.problems.join("; ")}` : ""}`);
    if (v.ok) valid.set(c.id, v.traceback);
  }
  if (validateOnly) return;

  const db = openDb(new URL("../eval/bench.db", import.meta.url).pathname);
  const ai = makeAI(db);
  if (!ai) throw new Error("JR_ANTHROPIC_API_KEY is not set");
  const startSpend = ai.guard.total();
  const results: Array<Record<string, unknown>> = [];

  for (const c of cases) {
    if (!valid.has(c.id)) continue;
    if (ai.guard.total() - startSpend > STOP_AT_USD) {
      results.push({ id: c.id, skipped: "budget" });
      continue;
    }
    const spend0 = ai.guard.total();
    const t0 = Date.now();
    const tb = c.kind === "noise" ? c.traceback! : valid.get(c.id)!;
    const parsed = parseTraceback(tb)!;

    // A fresh app record per case, with the app's critical flows (and an open exam window for examhall).
    const appCfg = bench.apps[c.app];
    const settings: ProjectSettings = { critical: appCfg.critical, ...(appCfg.exam_open ? { exam_until: new Date(Date.now() + 3_600_000).toISOString() } : {}) };
    const pid = Math.floor(Math.random() * 1e9);
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (?, ?, ?, 'faurus', NULL, 'read', ?, ?)").run(pid, `${c.id}-${pid}`, `k${pid}`, JSON.stringify(settings), new Date().toISOString());
    const ev: CleanEvent = {
      event_id: `${pid}`.padStart(32, "0"),
      timestamp: new Date().toISOString(),
      level: "error",
      platform: appCfg.language === "node" ? "node" : "python",
      release: null,
      environment: "production",
      transaction: c.route,
      exception_type: parsed.exception_type,
      message: parsed.message,
      chain: [],
      frames: parsed.frames,
      tags: {},
      sdk: "jr-bench",
    };
    const stored = storeEvent(db, pid, ev);
    if (!stored.stored) continue;
    const decision = await decide(db, ai, { incidentId: stored.incidentId, projectId: pid, projectName: c.app, change: "new", status: "open", hits: 1, event: ev }, false);
    const tDecision = (Date.now() - t0) / 1000;
    const alerted = decision.action === "notify" || decision.action === "wake";
    const row: Record<string, unknown> = {
      id: c.id,
      app: c.app,
      kind: c.kind,
      difficulty: c.difficulty ?? null,
      route: c.route,
      error: `${parsed.exception_type}: ${parsed.message}`.slice(0, 120),
      decision: decision.action,
      rule: decision.rule,
      decision_right: c.kind === "noise" ? !alerted : alerted,
      decision_seconds: Number(tDecision.toFixed(1)),
    };

    if (c.kind === "bug") {
      const broken = copyApp(c.app, c.inject ?? []);
      const src = new LocalSource(broken);
      const { files } = await gatherFiles(db, src, pid, parsed.frames, null);
      const out = await runDiagnosis(ai, ev, files, false);
      row.diagnosis_seconds = Number(((Date.now() - t0) / 1000).toFixed(1));
      if ("error" in out) {
        row.diagnosis_error = out.error;
      } else {
        const injected = (c.inject ?? []).map((e) => e.file);
        const named = [out.result.file, ...out.result.edits.map((e) => e.file)];
        row.named = `${out.result.file}:${out.result.line}`;
        row.right_file = named.some((n) => injected.some((f) => f === n || f.endsWith(`/${n}`) || n.endsWith(`/${f}`)));
        row.cause = out.result.cause_plain;
        const gate = await runGate(ai, out.result, files);
        row.gate = gate.level ?? (gate.passed ? "recommended" : "withheld");
        row.gate_reasons = gate.reasons;
        row.changed_lines = gate.changed_lines;
        // Did the proposed edit really fix it? Judged by OUR hidden test, which the model never saw.
        if (Object.keys(gate.patched).length) {
          const patched = copyApp(c.app, c.inject ?? []);
          for (const [p, text] of Object.entries(gate.patched)) writeFileSync(join(patched, p), text);
          row.fix_works = hiddenTest(patched, c.test!);
          const proof = await proveFix(broken, gate.patched, out.result.regression_test);
          row.own_test = proof.verdict;
        } else {
          row.fix_works = false;
          row.own_test = "skipped";
        }
        row.total_seconds = Number(((Date.now() - t0) / 1000).toFixed(1));
      }
    }
    row.cost_usd = Number((ai.guard.total() - spend0).toFixed(4));
    results.push(row);
    console.log(
      `${c.id.padEnd(30)} ${String(row.decision).padEnd(7)} ${row.decision_right ? "✓" : "✗"}` +
        (c.kind === "bug" ? `  file ${row.right_file ? "✓" : "✗"}  gate ${row.gate}  fix ${row.fix_works ? "works" : "fails"}  own-test ${row.own_test}` : "") +
        `  $${row.cost_usd}`,
    );
  }

  const bugs = results.filter((r) => r.kind === "bug" && !r.skipped && !r.diagnosis_error);
  const noise = results.filter((r) => r.kind === "noise");
  const n = (xs: typeof results, f: (r: Record<string, unknown>) => boolean) => xs.filter(f).length;
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
  const shown = bugs.filter((r) => r.gate === "recommended" || r.gate === "caution" || r.gate === "shown");
  const cost = ai.guard.total() - startSpend;
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const appSizes = Object.keys(bench.apps).map((a) => `${a} (${spawnSync("find", [join(BENCH, "apps", a), "-name", "*.py"], { encoding: "utf8" }).stdout.trim().split("\n").length} files)`).join(", ");
  const md = [
    "# JR-Bench results",
    "",
    `Run on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. ${bugs.length} planted bugs and ${noise.length} noise errors across 6 sample apps: ${appSizes}.`,
    "Every bug is planted into clean code as if a commit introduced it, then the app is made to crash for real. JaagteRaho sees only the traceback and the app's files, never the hidden test.",
    "",
    "| What | Result |",
    "|---|---|",
    `| Real bugs that reached the owner (notify or wake) | ${n(bugs, (r) => r.decision_right === true)} of ${bugs.length} (${pct(n(bugs, (r) => r.decision_right === true), bugs.length)}) |`,
    `| Noise errors kept quiet (logged or ignored) | ${n(noise, (r) => r.decision_right === true)} of ${noise.length} |`,
    `| Bugs during the exam window on a critical route that woke the owner | ${n(bugs, (r) => r.app === "examhall" && r.decision === "wake")} of ${n(bugs, (r) => r.app === "examhall")} |`,
    `| Right file named | ${n(bugs, (r) => r.right_file === true)} of ${bugs.length} (${pct(n(bugs, (r) => r.right_file === true), bugs.length)}) |`,
    `| Proposed edit fixes the bug (our hidden test passes) | ${n(bugs, (r) => r.fix_works === true)} of ${bugs.length} (${pct(n(bugs, (r) => r.fix_works === true), bugs.length)}) |`,
    `| Fixes shown to the owner after the gate | ${shown.length} of ${bugs.length}: ${n(bugs, (r) => r.gate === "recommended" || r.gate === "shown")} recommended, ${n(bugs, (r) => r.gate === "caution")} "use with care" |`,
    `| Shown fixes that were wrong (hidden test fails) | ${n(shown, (r) => r.fix_works !== true)} of ${shown.length} |`,
    `| Withheld fixes that would have worked | ${n(bugs, (r) => r.gate === "withheld" && r.fix_works === true)} |`,
    `| Model's own regression test agreed with ours | ${n(bugs, (r) => r.own_test === "proved" && r.fix_works === true) + n(bugs, (r) => r.own_test === "not_proved" && r.fix_works !== true)} of ${n(bugs, (r) => r.own_test === "proved" || r.own_test === "not_proved")} that ran |`,
    `| Median time: decision / fix ready | ${median(results.map((r) => r.decision_seconds as number).filter(Boolean))} s / ${median(bugs.map((r) => r.total_seconds as number).filter(Boolean))} s |`,
    `| Cost | $${cost.toFixed(3)} total; about $${(cost / Math.max(1, results.length)).toFixed(4)} per error |`,
    "",
    "| Case | Kind | Decision | Right file | Gate | Fix works | Own test | Cost |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.kind === "noise" ? "noise" : r.difficulty === "root_elsewhere" ? "bug (cause elsewhere)" : "bug"} | ${r.decision}${r.decision_right ? "" : " ✗"} | ${r.kind === "bug" ? (r.right_file ? "yes" : "no") : "-"} | ${r.gate ?? "-"} | ${r.kind === "bug" ? (r.fix_works ? "yes" : "no") : "-"} | ${r.own_test ?? "-"} | $${r.cost_usd} |`),
  ].join("\n");
  // Extra case files (e.g. the playground's) never overwrite the published results.
  const tag = (process.env.JR_RELATED_FILES === "0" ? "-no-related" : "") + (args.includes("--cases") ? "-extra" : "");
  writeFileSync(join(BENCH, `RESULTS${tag}.md`), `${md}\n`);
  writeFileSync(join(BENCH, `results${tag}.json`), JSON.stringify(results, null, 2));
  console.log(`\n${md.split("\n").slice(5, 18).join("\n")}`);
}

try {
  await main();
} finally {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
}
