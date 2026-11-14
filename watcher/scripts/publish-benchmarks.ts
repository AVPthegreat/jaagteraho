// Copies the measured benchmark numbers into the website (site/app/evidence/benchmarks.json),
// so the Evidence page shows exactly what the last runs measured. Run after eval:real and bench.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Row = Record<string, unknown>;
const read = (p: string): Row[] | null => (existsSync(new URL(p, import.meta.url)) ? (JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as Row[]) : null);
const count = (rows: Row[], f: (r: Row) => boolean) => rows.filter(f).length;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const sum = (rows: Row[]) => Number(rows.reduce((a, r) => a + (Number(r.cost_usd) || 0), 0).toFixed(3));

function real(rows: Row[] | null) {
  if (!rows) return null;
  const done = rows.filter((r) => "file_hit" in r);
  const part = (k: string | null) => {
    const set = k ? done.filter((r) => r.difficulty === k) : done;
    return { cases: set.length, right_file: count(set, (r) => r.file_hit === true), right_lines: count(set, (r) => r.line_hit === true) };
  };
  return {
    cases: rows.length,
    projects: new Set(rows.map((r) => r.repo)).size,
    all: part(null),
    in_trace: part("in_trace"),
    elsewhere: part("root_elsewhere"),
    cost_usd: sum(done),
    median_seconds: median(done.map((r) => Number(r.seconds))),
  };
}

function bench(rows: Row[] | null) {
  if (!rows) return null;
  const bugs = rows.filter((r) => r.kind === "bug" && !r.diagnosis_error && !r.skipped);
  const noise = rows.filter((r) => r.kind === "noise");
  const shown = bugs.filter((r) => r.gate === "recommended" || r.gate === "caution" || r.gate === "shown");
  return {
    bugs: bugs.length,
    noise: noise.length,
    alerted: count(bugs, (r) => r.decision_right === true),
    noise_quiet: count(noise, (r) => r.decision_right === true),
    exam_woke: count(bugs, (r) => r.app === "examhall" && r.decision === "wake"),
    exam_cases: count(bugs, (r) => r.app === "examhall"),
    right_file: count(bugs, (r) => r.right_file === true),
    fix_works: count(bugs, (r) => r.fix_works === true),
    elsewhere: count(bugs, (r) => r.difficulty === "root_elsewhere"),
    elsewhere_fixed: count(bugs, (r) => r.difficulty === "root_elsewhere" && r.fix_works === true),
    shown: shown.length,
    recommended: count(bugs, (r) => r.gate === "recommended" || r.gate === "shown"),
    caution: count(bugs, (r) => r.gate === "caution"),
    shown_wrong: count(shown, (r) => r.fix_works !== true),
    withheld_working: count(bugs, (r) => r.gate === "withheld" && r.fix_works === true),
    proved: count(bugs, (r) => r.own_test === "proved"),
    cost_usd: sum(rows),
    cost_per_error_usd: Number((sum(rows) / Math.max(1, rows.length)).toFixed(4)),
    median_decision_seconds: median(rows.map((r) => Number(r.decision_seconds)).filter(Boolean)),
    median_fix_seconds: median(bugs.map((r) => Number(r.total_seconds)).filter(Boolean)),
    rows: rows.map((r) => ({ id: r.id, kind: r.kind, difficulty: r.difficulty, decision: r.decision, decision_right: r.decision_right, right_file: r.right_file ?? null, gate: r.gate ?? null, fix_works: r.fix_works ?? null })),
  };
}

const out = {
  measured_at: new Date().toISOString().slice(0, 10),
  // Baseline: all 30 cases with stack-trace files only. Then the 9 "cause elsewhere" cases again with imported files.
  real_bugs: { before: real(read("../eval/results-real-no-related.json")), after: null as ReturnType<typeof real>, elsewhere_with_imports: real(read("../eval/results-real-root_elsewhere.json"))?.elsewhere ?? null },
  // The final run is the result. The two earlier runs on the same 16 Python bugs show what the three-level gate changed.
  jr_bench: { before: null as ReturnType<typeof bench>, after: bench(read("../../bench/results.json")) },
  gate_history: {
    one_level: bench(read("../../bench/results-no-related.json")),
    three_level: bench(read("../../bench/results-gate3-related-v1.json")),
  },
};
for (const k of ["one_level", "three_level"] as const) if (out.gate_history[k]) out.gate_history[k] = { ...out.gate_history[k]!, rows: [] };
writeFileSync(new URL("../../site/app/evidence/benchmarks.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ real: out.real_bugs.after?.all ?? out.real_bugs.before?.all, bench: out.jr_bench.after && { ...out.jr_bench.after, rows: undefined } }, null, 2));
