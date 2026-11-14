import type { Metadata } from "next";
import { Bars } from "../ui/bars";
import { BENCH_ALL, benchInr, benchInrPerBug, FAURUS_BENCH as FB } from "../site";
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

function Table({ head, rows, label }: { head: string[]; rows: string[][]; label: string }) {
  return (
    <div className="table-wrap" data-rv>
      <table className="nums" aria-label={label}>
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
  const b = benchmarks.jr_bench.after as Bench;
  const history = (benchmarks as { gate_history?: { one_level: Bench; three_level: Bench } }).gate_history;
  if (!real && !b) return null;
  return (
    <>
      {b && (
        <div className="doc">
          <h2 id="bench-h" data-rv>
            JR-Bench: planted bugs in 7 live apps we built
          </h2>
          <div className="body">
            <p className="soft" data-rv>
              Seven generated apps of different sizes (21 to 101 files; six in Python, one in Node.js). Each bug is planted as if a commit introduced
              it and triggered for real. JaagteRaho decides, explains and proposes a fix; a hidden test it never sees judges whether the fix works. Four
              noise errors (a dropped connection, a missing favicon, a bot scanner, a planned restart) check that it stays quiet.
            </p>
            <Table
              label="JR-Bench results"
              head={["Measure", "Result"]}
              rows={[
                ["Planted bugs that reached the owner", frac(b.alerted, b.bugs)],
                ["Noise kept quiet", frac(b.noise_quiet, b.noise)],
                ["Bugs on a critical route during an exam that woke the owner", frac(b.exam_woke, b.exam_cases)],
                ["Right file", frac(b.right_file, b.bugs)],
                ["Proposed fix works (hidden test passes)", frac(b.fix_works, b.bugs)],
                [
                  "Fixes shown to the owner",
                  b.caution !== undefined ? `${b.shown} of ${b.bugs}: ${b.recommended} recommended, ${b.caution} "use with care"` : `${b.shown} of ${b.bugs}`,
                ],
                ["Fixes shown to the owner that were wrong", `${b.shown_wrong} of ${b.shown} shown`],
                ["Working fixes the safety gate held back", String(b.withheld_working)],
                ...(history?.one_level && history?.three_level
                  ? [["Working fixes shown, same 16 Python bugs: first gate → three-level gate", `${history.one_level.shown} → ${history.three_level.shown} of 16`]]
                  : []),
                ["Median seconds: decision / fix ready", `${b.median_decision_seconds ?? "-"} / ${b.median_fix_seconds ?? "-"}`],
                ["Cost per error (decision, diagnosis, fix review)", `$${b.cost_per_error_usd.toFixed(4)}`],
              ]}
            />
          </div>
        </div>
      )}
      <div className="doc">
        <h2 id="faurus-h" data-rv>
          On real production code: Faurus, {FB.bugs} planted bugs
        </h2>
        <div className="body">
          <p className="soft" data-rv>
            Faurus is a live coding and exam platform with {FB.accounts} accounts. We copied {FB.files} of its backend files ({FB.lines} lines) into a
            private folder, planted {FB.bugs} bugs of the kind a real commit introduces, made each one crash for real, and let JaagteRaho handle it. A
            hidden test it never saw judged every fix: the crash must be gone and every other call must return exactly what the clean code returns.
          </p>
          <Table
            label="JaagteRaho on a private copy of the Faurus backend"
            head={["Measure", `All ${FB.bugs} bugs`, `Critical paths (${FB.critical})`]}
            rows={[
              ["Reached the owner", frac(FB.reached, FB.bugs), frac(FB.critical, FB.critical)],
              ["Woke the owner (exam window open)", String(FB.critical_woke), frac(FB.critical_woke, FB.critical)],
              ["Right file named", frac(FB.right_file, FB.bugs), frac(181, FB.critical)],
              ["Fix passed our hidden test", frac(FB.fix_works, FB.bugs), frac(FB.critical_fix_works, FB.critical)],
              ["Fix restored the exact original behaviour", frac(FB.strict, FB.bugs), frac(162, FB.critical)],
              ["Fixes shown to the owner that were wrong", `${FB.shown_wrong} of ${FB.shown} shown`, "–"],
              ["Would heal on its own (default rules)", `${FB.auto_heal}, of which ${FB.auto_heal_wrong} wrong (Undo exists for this)`, "–"],
              ["Working fixes held back by the safety rules", `${FB.held_back_working} (protected exam and judging code, or reviewers disagreed)`, "–"],
              ["Median seconds: decision / fix ready", `${FB.median_decision_s} / ${FB.median_fix_s.toFixed(1)}`, "–"],
              ["AI cost", `$${FB.cost_usd.toFixed(2)} in total, about $${FB.cost_per_bug_usd.toFixed(3)} a bug`, "–"],
            ]}
          />
          <p className="small soft" data-rv>
            Critical paths: submissions, exam attempts, contests, contest rating and sign-in. Caveats: a private copy of pure-logic modules, driven by
            direct calls rather than live HTTP; views, the database and the judge were not part of the copy, and this is not production traffic.
            Planted bugs are mechanical mutations with one changed spot each; real incidents can be messier. Faurus itself, its repository, database
            and servers were never changed.{" "}
            <a href={FB.csv} download>
              Download every bug as CSV
            </a>{" "}
            (one row per bug: module, severity, decision, right file, hidden-test result, gate, cost).
          </p>
        </div>
      </div>
      <div className="doc">
        <h2 id="extended-h" data-rv>
          Both sets together: {BENCH_ALL.bugs} planted bugs
        </h2>
        <div className="body">
          <p className="soft" data-rv>
            The {b ? b.bugs : 20} bugs above plus 50 more added for the live playground, run once with the same pipeline (14 Nov 2026). The published
            JR-Bench numbers above are unchanged. Full tables: <a href={BENCH_ALL.extra_md}>bench/RESULTS-extra.md</a> and{" "}
            <a href={BENCH_ALL.base_md}>bench/RESULTS.md</a>.
          </p>
          <Table
            label="Both benchmark sets together"
            head={["Measure", "Result"]}
            rows={[
              ["Bugs that reached the owner", frac(BENCH_ALL.reached, BENCH_ALL.bugs)],
              ["Proposed fix works (our hidden test passes)", frac(BENCH_ALL.fix_works, BENCH_ALL.bugs)],
              ["Right file named", frac(BENCH_ALL.right_file, BENCH_ALL.bugs)],
              ["Fixes shown to the owner that were wrong", `${BENCH_ALL.shown_wrong} of ${BENCH_ALL.shown} shown (all 5 in the extended set)`],
              ["Median seconds to a decision", `${BENCH_ALL.median_decision_s} (all ${BENCH_ALL.cases} errors)`],
              [
                "Total AI cost",
                `$${BENCH_ALL.cost_usd.toFixed(2)} for ${BENCH_ALL.cases} errors (about ₹${benchInr()}, ₹${benchInrPerBug()} a bug at ₹${BENCH_ALL.inr_per_usd} to the dollar)`,
              ],
            ]}
          />
        </div>
      </div>
      {real && (
        <div className="doc">
          <h2 id="real-h" data-rv>
            On 30 real bugs from open-source projects
          </h2>
          <div className="body">
            <p className="soft" data-rv>
              Tracebacks that people posted on GitHub for {real.projects} well-known Python projects (requests, Flask, pip, pytest, Celery and
              others), scored against the lines the real, merged fix changed. JaagteRaho reads the code as it was before the fix and never sees the real
              fix.
            </p>
            <Table
              label="Real-bug results"
              head={["Measure", "Result"]}
              rows={[
                ["Bug in a file from the traceback: right file", frac(real.in_trace.right_file, real.in_trace.cases)],
                ["Bug in a file from the traceback: right lines (±3)", frac(real.in_trace.right_lines, real.in_trace.cases)],
                ["All cases: right file", frac(real.all.right_file, real.all.cases)],
                ["Cost of the whole run", `$${real.cost_usd.toFixed(2)}`],
              ]}
            />
            <p className="small soft">
              Measured {benchmarks.measured_at}. The datasets, apps and scripts that produce these numbers are in the repository (
              <code>watcher/eval</code> and <code>bench</code>).
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export const metadata: Metadata = { title: "Evidence · JaagteRaho" };

export default async function Evidence() {
  const ev = await getEvidence();
  const marked = ev ? (ev.owner_marked.right ?? 0) + (ev.owner_marked.wrong ?? 0) : 0;
  // Rows with nothing counted yet are left out rather than shown as zeros.
  const maybe: Array<[string, string] | false> = ev
    ? [
        ["Runs on the break-it page", String(ev.runs)],
        ["People who tried it", String(ev.people)],
        ev.signed > 0 && ["People who signed the logbook", `${ev.signed}, from ${ev.signed_countries} ${ev.signed_countries === 1 ? "country" : "countries"}`],
        ev.signed_live_app > 0 && ["Of those, running a live app", String(ev.signed_live_app)],
        ev.median_seconds.alert !== null && ["Median seconds from error to alert", String(ev.median_seconds.alert)],
        ev.median_seconds.cause !== null && ["Median seconds from error to cause", String(ev.median_seconds.cause)],
        ev.median_seconds.fix !== null && ["Median seconds from error to fix proposal", String(ev.median_seconds.fix)],
        marked > 0 && ["Diagnoses the owner marked right", `${ev.owner_marked.right ?? 0} of ${marked}`],
        ["Average cost of one diagnosis", `$${ev.avg_diagnosis_cost_usd.toFixed(4)}`],
        !!ev.watching_itself?.incidents && ["Bugs it found in its own code", String(ev.watching_itself.incidents)],
        !!ev.watching_itself?.fixes_proposed && ["Fixes it proposed for its own code", String(ev.watching_itself.fixes_proposed)],
      ]
    : [];
  const rows = maybe.filter((r): r is [string, string] => r !== false);

  return (
    <>
      <section className="page-head" aria-labelledby="evidence-h">
        <div className="frame">
          <p className="eyebrow">Evidence</p>
          <h1 id="evidence-h" className="display" data-rv>
            Measured, <em>not claimed.</em>
          </h1>
          <p className="lead" data-rv style={{ "--d": 1 } as React.CSSProperties}>
            Every number on the home page, with how it was measured. Produced by scripts in the repository; mistakes are counted, not only hits.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="glance-h">
        <div className="frame">
          <div className="doc">
            <h2 id="glance-h" data-rv>
              JR-Bench at a glance
            </h2>
            <div className="body">
              <p className="soft" data-rv>
                20 planted bugs and 4 harmless errors in 7 apps we built and run, each triggered for real. Every bar is one of them, as tall as the alert it got.
              </p>
              <Bars />
            </div>
          </div>
          <div className="doc">
            <h2 id="live-h" data-rv>
              Counted live, from the demo
            </h2>
            <div className="body">
              <p className="soft" data-rv>
                Counted by the watcher itself from people using the <a href="/demo">exam portal</a>. The benchmark tables below come from scripts in the
                repository, run against real bugs and planted ones. Model vote shares are not probabilities. Faurus&apos;s own failure counts stay
                private.
              </p>
              {!ev ? (
                <p className="form-error" data-rv>
                  The watcher is not reachable right now, so the live counts can&apos;t be shown. The benchmarks below come from the repository and
                  don&apos;t need it.
                </p>
              ) : (
                <>
                  <ul className="ev-grid" data-rv>
                    <li>
                      <b>{ev.runs}</b>
                      <span>runs on the exam portal</span>
                    </li>
                    <li>
                      <b>{ev.people}</b>
                      <span>people who tried it</span>
                    </li>
                    <li>
                      <b>{ev.median_seconds.alert ?? "-"}{ev.median_seconds.alert !== null ? " s" : ""}</b>
                      <span>median, error to alert</span>
                    </li>
                    <li>
                      <b>{ev.median_seconds.fix ?? "-"}{ev.median_seconds.fix !== null ? " s" : ""}</b>
                      <span>median, error to checked fix</span>
                    </li>
                  </ul>
                  <Table label="Exam portal counts" head={["Measure", "Value"]} rows={rows} />
                </>
              )}
              {ev && ev.countries.length > 0 && <p className="soft">Countries: {ev.countries.map((c) => `${c.country} (${c.n})`).join(", ")}</p>}
            </div>
          </div>
          <Benchmarks />
        </div>
      </section>
    </>
  );
}
