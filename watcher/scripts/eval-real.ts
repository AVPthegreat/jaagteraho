// Accuracy on real bugs: for each case in eval/real-bugs.json (a traceback someone posted on GitHub,
// plus the lines the real fix changed), run JaagteRaho's diagnosis exactly as the paste page does,
// against the code as it was before the fix, and score it.
//
// Scores per case:
//   file  - the diagnosis names (or edits) a file the real fix changed
//   lines - the named line, or the text an edit replaces, lies within 3 lines of what the real fix changed
//   gate  - the proposed fix passed the 6 code checks (the Claude review is skipped here to save cost)
//
// Usage: npm run eval:real [-- --limit 5] [-- --only celery]
// Uses its own database (eval/eval.db) so it never touches the live app's daily caps. Stops at $2.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { makeAI } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { codeChecks } from "../src/pipeline/gate.js";
import { runDiagnosis, type SourceFile } from "../src/pipeline/diagnose.js";
import { relatedFiles } from "../src/source/related.js";
import { locate, type SourceProvider } from "../src/source/source.js";
import { parseTraceback } from "../src/web/paste.js";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

type Case = {
  repo: string;
  issue_url: string;
  traceback: string;
  buggy_commit: string;
  fix_url: string;
  fixed_files: string[];
  fixed_lines: Array<{ file: string; start: number; end: number }>;
  cause_summary: string;
  difficulty: "in_trace" | "root_elsewhere";
};

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const STOP_AT_USD = 2;
const TOLERANCE = 3;

/** Raw file reads (no API rate limit), trying a src/ layout as well. */
class RawSource implements SourceProvider {
  name = "raw";
  constructor(private repo: string, private sha: string) {}
  async getFile(path: string): Promise<string | null> {
    for (const p of [path, `src/${path}`]) {
      const res = await fetch(`https://raw.githubusercontent.com/${this.repo}/${this.sha}/${p}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (res?.ok) return res.text();
    }
    return null;
  }
}

const sameFile = (a: string, b: string) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

function score(c: Case, files: SourceFile[], r: { file: string; line: number; edits: Array<{ file: string; find: string }> }) {
  const named = [r.file, ...r.edits.map((e) => e.file)];
  const fileHit = named.some((n) => c.fixed_files.some((f) => sameFile(n, f)));
  const near = (file: string, line: number) => c.fixed_lines.some((l) => sameFile(file, l.file) && line >= l.start - TOLERANCE && line <= l.end + TOLERANCE);
  let lineHit = near(r.file, r.line);
  for (const e of r.edits) {
    const shown = files.find((f) => sameFile(f.path, e.file));
    const idx = shown && e.find ? shown.text.indexOf(e.find) : -1;
    if (idx < 0) continue;
    const start = shown!.text.slice(0, idx).split("\n").length;
    const end = start + e.find.split("\n").length - 1;
    for (let l = start; l <= end; l++) if (near(e.file, l)) lineHit = true;
  }
  return { fileHit, lineHit };
}

async function main() {
  const cases = (JSON.parse(readFileSync(new URL("../eval/real-bugs.json", import.meta.url), "utf8")) as Case[])
    .filter((c) => !opt("only") || c.repo.includes(opt("only")!))
    .filter((c) => !opt("difficulty") || c.difficulty === opt("difficulty"))
    .slice(0, Number(opt("limit") ?? 1000));
  mkdirSync(new URL("../eval/", import.meta.url), { recursive: true });
  const db = openDb(new URL("../eval/eval.db", import.meta.url).pathname);
  const ai = makeAI(db);
  if (!ai) throw new Error("JR_ANTHROPIC_API_KEY is not set");
  const startSpend = ai.guard.total();

  const results: Array<Record<string, unknown>> = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++];
      if (ai.guard.total() - startSpend > STOP_AT_USD) {
        results.push({ repo: c.repo, issue: c.issue_url, skipped: "budget" });
        continue;
      }
      const parsed = parseTraceback(c.traceback);
      if (!parsed) {
        results.push({ repo: c.repo, issue: c.issue_url, difficulty: c.difficulty, error: "traceback not parsed" });
        continue;
      }
      // Tracebacks come from installed packages; frames inside the repository's package count as its code.
      const pkgs = new Set(c.fixed_files.map((f) => f.replace(/^src\//, "").split("/")[0].replace(/\.py$/, "")));
      const frames = parsed.frames.map((f) => ({ ...f, in_app: [...pkgs].some((p) => (f.abs_path ?? "").replace(/\\/g, "/").includes(`/${p}/`) || (f.abs_path ?? "").startsWith(`${p}/`)) }));
      const src = new RawSource(c.repo, c.buggy_commit);
      const files: SourceFile[] = [];
      for (const f of [...frames].reverse()) {
        if (!f.in_app || files.length >= 3) continue;
        const found = await locate(src, f.abs_path ?? "");
        if (!found) continue;
        const known = files.find((x) => x.path === found.path);
        if (known) known.focus = [...(known.focus ?? []), ...(f.lineno ? [f.lineno] : [])];
        else files.push({ path: found.path.replace(/^(?!src\/)/, ""), text: found.text, focus: f.lineno ? [f.lineno] : [] });
      }
      if (files.length === 0) {
        results.push({ repo: c.repo, issue: c.issue_url, difficulty: c.difficulty, error: "no repository files found from the traceback" });
        continue;
      }
      if (process.env.JR_RELATED_FILES !== "0") for (const r of await relatedFiles(src, files)) files.push({ ...r, related: true });
      const t0 = Date.now();
      const out = await runDiagnosis(ai, { exception_type: parsed.exception_type, message: parsed.message, transaction: null, frames }, files, false);
      if ("error" in out) {
        results.push({ repo: c.repo, issue: c.issue_url, difficulty: c.difficulty, error: out.error });
        continue;
      }
      const s = score(c, files, out.result);
      const gate = codeChecks(out.result, files);
      results.push({
        repo: c.repo,
        issue: c.issue_url,
        fix: c.fix_url,
        difficulty: c.difficulty,
        files_shown: files.map((f) => f.path),
        fixed_files: c.fixed_files,
        named: `${out.result.file}:${out.result.line}`,
        file_hit: s.fileHit,
        line_hit: s.lineHit,
        gate_passed: gate.passed,
        gate_reasons: gate.reasons,
        confidence: out.result.confidence_words,
        cause_plain: out.result.cause_plain,
        real_cause: c.cause_summary,
        seconds: Math.round((Date.now() - t0) / 1000),
        cost_usd: Number(out.cost.toFixed(4)),
      });
      console.log(`${s.fileHit ? "✓" : "✗"} file ${s.lineHit ? "✓" : "✗"} lines  ${c.repo.padEnd(28)} ${c.difficulty.padEnd(15)} ${out.result.file}:${out.result.line}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const done = results.filter((r) => "file_hit" in r);
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");
  const by = (k: string) => done.filter((r) => r.difficulty === k);
  const row = (label: string, set: typeof done) =>
    `| ${label} | ${set.length} | ${set.filter((r) => r.file_hit).length} (${pct(set.filter((r) => r.file_hit).length, set.length)}) | ${set.filter((r) => r.line_hit).length} (${pct(set.filter((r) => r.line_hit).length, set.length)}) | ${set.filter((r) => r.gate_passed).length} |`;
  const cost = ai.guard.total() - startSpend;
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const summary = [
    `# Accuracy on real bugs`,
    "",
    `Run on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC with ${ai.diagnosisModel}. ${cases.length} cases from ${new Set(cases.map((c) => c.repo)).size} public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.`,
    "",
    "| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |",
    "|---|---|---|---|---|",
    row("All", done),
    row("Fault in the traceback", by("in_trace")),
    row("Root cause elsewhere", by("root_elsewhere")),
    "",
    `Total cost $${cost.toFixed(2)} (about $${(cost / Math.max(1, done.length)).toFixed(3)} per diagnosis); median ${median(done.map((r) => r.seconds as number))} s per diagnosis.`,
    `Not diagnosed: ${results.length - done.length} (${results.filter((r) => !("file_hit" in r)).map((r) => `${r.repo}: ${r.error ?? r.skipped}`).join("; ") || "none"}).`,
    "",
    "How it works: the traceback is parsed as the paste page parses it; up to 3 repository files from the traceback are read at the commit before the fix; one Claude call proposes the cause and an edit. The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.",
    "",
    "| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |",
    "|---|---|---|---|---|---|---|",
    ...done.map((r) => `| ${r.repo} | ${r.difficulty === "in_trace" ? "in trace" : "elsewhere"} | \`${r.named}\` | ${r.file_hit ? "yes" : "no"} | ${r.line_hit ? "yes" : "no"} | [issue](${r.issue}) | [fix](${r.fix}) |`),
  ].join("\n");
  const tag = (process.env.JR_RELATED_FILES === "0" ? "-no-related" : "") + (opt("difficulty") ? `-${opt("difficulty")}` : "");
  writeFileSync(new URL(`../eval/results-real${tag}.json`, import.meta.url), JSON.stringify(results, null, 2));
  writeFileSync(new URL(`../eval/REAL-BUGS${tag}.md`, import.meta.url), `${summary}\n`);
  console.log(`\n${summary.split("\n").slice(4, 11).join("\n")}`);
}

await main();
