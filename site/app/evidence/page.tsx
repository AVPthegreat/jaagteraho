import type { Metadata } from "next";
import { getEvidence } from "../watcher";
import benchmarks from "./benchmarks.json";

type Part = { cases: number; right_file: number; right_lines: number };
type Real = { cases: number; projects: number; all: Part; in_trace: Part; elsewhere: Part; cost_usd: number; median_seconds: number | null } | null;
type Bench = {
  bugs: number;
  noise: number;
  alerted: number;
  noise_quiet: number;
  exam_woke: number;
  exam_cases: number;
  right_file: number;
  fix_works: number;
  elsewhere: number;
  elsewhere_fixed: number;
  shown: number;
  recommended?: number;
  caution?: number;
  shown_wrong: number;
  withheld_working: number;
  proved: number;
  cost_usd: number;
  cost_per_error_usd: number;
  median_decision_seconds: number | null;
  median_fix_seconds: number | null;
} | null;

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
const frac = (a: number, b: number) => `${a} of ${b} (${pct(a, b)})`;

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="nums">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th scope="col" key={i}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={i ? "n" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Benchmarks() {
  const real = benchmarks.real_bugs.before as Real;
  const withImports = (benchmarks.real_bugs as { elsewhere_with_imports?: Part | null }).elsewhere_with_imports ?? null;
  const b = benchmarks.jr_bench.after as Bench;
  const history = (benchmarks as { gate_history?: { one_level: Bench; three_level: Bench } }).gate_history;
  if (!real && !b) return null;
  return (
    <>
      {real && (
        <>
          <h3 style={{ marginTop: 40 }}>On 30 real bugs from open-source projects</h3>
          <div className="prose muted">
            <p>
              Tracebacks that people posted on GitHub for {real.projects} well-known Python projects (requests, Flask, pip, pytest, Celery and
              others), scored against the lines the real, merged fix changed. JaagteRaho reads the code as it was before the fix and never sees the
              real fix.
            </p>
          </div>
          <Table
            head={["Measure", "Result"]}
            rows={[
              ["Bug in a file from the traceback: right file", frac(real.in_trace.right_file, real.in_trace.cases)],
              ["Bug in a file from the traceback: right lines (±3)", frac(real.in_trace.right_lines, real.in_trace.cases)],
              ["Cause outside the traceback: right file", frac(real.elsewhere.right_file, real.elsewhere.cases)],
              ...(withImports ? [["Same, also showing the files the failing code imports and calls", frac(withImports.right_file, withImports.cases)]] : []),
              ["All cases: right file", frac(real.all.right_file, real.all.cases)],
              ["Cost of the whole run", `$${real.cost_usd.toFixed(2)}`],
            ]}
          />
          <p className="muted" style={{ fontSize: 14 }}>
            Our weak spot: a cause in a file the traceback never mentions, deep inside a large library. Small apps, which is what JaagteRaho is
            for, do better (below).
          </p>
        </>
      )}
      {b && (
        <>
          <h3 style={{ marginTop: 40 }}>JR-Bench: planted bugs in 7 sample apps</h3>
          <div className="prose muted">
            <p>
              Seven generated apps of different sizes (21 to 101 files; six in Python, one in Node.js). Each bug is planted as if a commit
              introduced it and triggered for real. JaagteRaho decides, explains and proposes a fix; a hidden test it never sees judges whether the
              fix works. Four noise errors (a dropped connection, a missing favicon, a bot scanner, a planned restart) check that it stays quiet.
            </p>
          </div>
          <Table
            head={["Measure", "Result"]}
            rows={[
              ["Real bugs that reached the owner", frac(b.alerted, b.bugs)],
              ["Noise kept quiet", frac(b.noise_quiet, b.noise)],
              ["Bugs on a critical route during an exam that woke the owner", frac(b.exam_woke, b.exam_cases)],
              ["Right file", frac(b.right_file, b.bugs)],
              ["Proposed fix works (hidden test passes)", frac(b.fix_works, b.bugs)],
              ["Fixes shown to the owner", b.caution !== undefined ? `${b.shown} of ${b.bugs}: ${b.recommended} recommended, ${b.caution} "use with care"` : `${b.shown} of ${b.bugs}`],
              ["Fixes shown to the owner that were wrong", `${b.shown_wrong} of ${b.shown} shown`],
              ["Working fixes the safety gate held back", String(b.withheld_working)],
              ...(history?.one_level && history?.three_level
                ? [["Working fixes shown, same 16 Python bugs: first gate → three-level gate", `${history.one_level.shown} → ${history.three_level.shown} of 16`]]
                : []),
              ["Median seconds: decision / fix ready", `${b.median_decision_seconds ?? "-"} / ${b.median_fix_seconds ?? "-"}`],
              ["Cost per error (decision, diagnosis, fix review)", `$${b.cost_per_error_usd.toFixed(4)}`],
            ]}
          />
        </>
      )}
      <p className="muted" style={{ fontSize: 14 }}>
        Measured {benchmarks.measured_at}. The datasets, sample apps and scripts that produce these numbers are in the repository (
        <code className="mono">watcher/eval</code> and <code className="mono">bench</code>).
      </p>
    </>
  );
}

export const metadata: Metadata = { title: "Evidence · JaagteRaho" };

export default async function Evidence() {
  const ev = await getEvidence();
  const marked = ev ? (ev.owner_marked.right ?? 0) + (ev.owner_marked.wrong ?? 0) : 0;
  const rows: Array<[string, string]> = ev
    ? [
        ["Runs on the break-it page", String(ev.runs)],
        ["People who tried it", String(ev.people)],
        ["People who signed the logbook", `${ev.signed}, from ${ev.signed_countries} ${ev.signed_countries === 1 ? "country" : "countries"}`],
        ["Of those, running a live app", String(ev.signed_live_app)],
        ["Median seconds from error to alert", ev.median_seconds.alert === null ? "not measured yet" : String(ev.median_seconds.alert)],
        ["Median seconds from error to cause", ev.median_seconds.cause === null ? "not measured yet" : String(ev.median_seconds.cause)],
        ["Median seconds from error to fix proposal", ev.median_seconds.fix === null ? "not measured yet" : String(ev.median_seconds.fix)],
        ["Diagnoses the owner marked right", marked ? `${ev.owner_marked.right ?? 0} of ${marked}` : "none marked yet"],
        ["Average cost of one diagnosis", `$${ev.avg_diagnosis_cost_usd.toFixed(4)}`],
        ...(ev.watching_itself
          ? ([
              ["Bugs it found in its own code", String(ev.watching_itself.incidents)],
              ["Fixes it proposed for itself / applied by us", `${ev.watching_itself.fixes_proposed} / ${ev.watching_itself.fixes_applied}`],
            ] as Array<[string, string]>)
          : []),
      ]
    : [];

  return (
    <section className="section" style={{ borderTop: 0 }}>
      <p className="eyebrow">Measured, not claimed</p>
      <h2>Evidence</h2>
      <div className="prose muted">
        <p>
          The first table is counted live by the watchman itself. The benchmark tables below come from scripts in the repository, run against
          real bugs and planted ones, and say exactly what was measured. Model vote shares are not probabilities. Faurus&apos;s own failure
          counts stay private.
        </p>
      </div>
      {!ev ? (
        <p>The watcher is not reachable right now.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="nums">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="n">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ev && ev.countries.length > 0 && (
        <p className="muted">Countries: {ev.countries.map((c) => `${c.country} (${c.n})`).join(", ")}</p>
      )}
      <Benchmarks />

    </section>
  );
}
