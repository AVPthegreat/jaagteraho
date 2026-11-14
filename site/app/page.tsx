import Link from "next/link";
import { headers } from "next/headers";
import { BreakIt } from "./break-it";
import { getEvidence } from "./watcher";
import benchmarks from "./evidence/benchmarks.json";

const REPO = "https://github.com/AVPthegreat/jaagteraho";
const DECIDE = `${REPO}/blob/main/watcher/src/pipeline/decide.ts`;

const secs = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v} s`);

/* Small line icons in the lantern colour. Decorative: every step also has a text title. */
function Icon({ name }: { name: "inbox" | "rules" | "explain" | "check" }) {
  const p = { stroke: "#f2b441", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="step-icon">
      {name === "inbox" && (
        <>
          <path {...p} d="M5 18h6l2 3h6l2-3h6" />
          <path {...p} d="M5 18l3-10h16l3 10v7H5z" />
          <path {...p} d="M16 4v8m-3-3 3 3 3-3" />
        </>
      )}
      {name === "rules" && (
        <>
          <path {...p} d="M8 6h16v20H8z" />
          <path {...p} d="M12 12h8M12 17h8M12 22h5" />
        </>
      )}
      {name === "explain" && (
        <>
          <path {...p} d="M6 7h20v13H15l-5 5v-5H6z" />
          <path {...p} d="M11 12h10M11 16h6" />
        </>
      )}
      {name === "check" && (
        <>
          <path {...p} d="M16 4l10 4v7c0 6-4.5 10-10 13C10.5 25 6 21 6 15V8z" />
          <path {...p} d="M11.5 16l3 3 6-6" />
        </>
      )}
    </svg>
  );
}

/* The rule table from decide.ts, in plain words, in the order the code checks it. */
const RULES: Array<[string, string, "wake" | "notify" | "quiet"]> = [
  ["A critical flow (exam submission, login, payment) fails while an exam is running", "Wake you", "wake"],
  ["A critical flow fails 3 or more times in 10 minutes while you are away", "Wake you", "wake"],
  ["Any other failure in a critical flow", "Message you", "notify"],
  ["Claude rates it an outage or data loss", "Wake you", "wake"],
  ["It blocks users from doing something", "Message you", "notify"],
  ["A feature works worse but still works", "Message you, or keep it for the 08:00 summary if you are away", "notify"],
  ["Minor or cosmetic", "Keep it for the 08:00 summary", "quiet"],
  ["Clearly noise (a bot scanner, a missing favicon) and low severity", "Ignore it", "quiet"],
  ["5 or more different people hit it in one hour", "Never stay quiet: at least a message", "notify"],
  ["The AI could not answer", "Message you; never ignore it", "notify"],
];

export default async function Home() {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  const ev = await getEvidence();
  const bench = benchmarks.jr_bench.after;
  const real = benchmarks.real_bugs.before;
  const benchDate = new Date(benchmarks.measured_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const at = (v: number | null | undefined) => (secs(v) ? `, about ${secs(v)} after the error` : "");

  return (
    <>
      {/* 1 · The problem, in one line */}
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero-text">
          <p className="eyebrow">An AI on-call agent for apps with nobody on call</p>
          <h1 id="hero-h">Your app breaks at 2 am. JaagteRaho stays awake for you.</h1>
          <p className="lede">
            An AI agent that reads every error from your live app, wakes you only when real users are hurt, tells you the cause with the file and
            line, and has a checked fix waiting for your approval. It never changes your code on its own.
          </p>
          <div className="actions">
            <a className="btn" href="#demo">
              Break our demo app now
            </a>
            <Link className="btn ghost" href="/connect">
              Connect your app in 2 minutes
            </Link>
          </div>
          <p className="muted small">
            For students, freelancers and solo founders who run a live product alone. Python and Node.js apps. No sign-up to try the demo; free
            during HackGlobal 2026.
          </p>
        </div>

        <figure className="tg hero-alert" aria-labelledby="alert-cap">
          <figcaption id="alert-cap" className="eyebrow">
            Example alert · what reaches your phone
          </figcaption>
          <div className="tg-msg">
            <p>
              <b className="wake-text">WAKE</b> · exam-portal · Submit code failing
            </p>
            <p>Rule 2: a critical flow failing during an exam</p>
            <p className="gap">
              <b>Cause:</b> The Submit button never says which language the code is in, and the server insists on knowing it.
            </p>
            <p>
              <code className="mono">portal/submissions.py:14</code> · likely
            </p>
            <p className="gap">
              <b>Fix:</b> ready · all checks passed · AI-written · waiting for you
            </p>
          </div>
          <div className="tg-btns" aria-hidden="true">
            <span>Why?</span>
            <span>Show fix</span>
            <span>Acknowledge</span>
          </div>
          <p className="muted small">
            Based on the bug in our demo exam portal. On Telegram it comes with a spoken wake-up call. You can trigger the same bug{" "}
            <a href="#demo">in the live demo below</a>.
          </p>
        </figure>
      </section>

      {/* 2 · The headline numbers, straight after the promise */}
      <section aria-labelledby="strip-h">
        <h2 id="strip-h" className="eyebrow">
          Measured on {benchDate}, mistakes included
        </h2>
        <div className="measured">
          <div>
            <strong>
              {bench.alerted} of {bench.bugs}
            </strong>
            <span>bugs planted in 7 sample apps reached the owner, each triggered for real</span>
          </div>
          <div>
            <strong>{bench.shown_wrong} wrong</strong>
            <span>
              among the {bench.shown} fixes shown to the owner, judged by hidden tests it never saw
            </span>
          </div>
          <div>
            <strong>
              {bench.noise_quiet} of {bench.noise}
            </strong>
            <span>harmless errors (bot scanners, a missing favicon) kept quiet: nobody woken for nothing</span>
          </div>
          <div>
            <strong>{bench.median_decision_seconds} s</strong>
            <span>
              median from error to decision; a checked fix in {bench.median_fix_seconds} s. <a href="#proof">Every number →</a>
            </span>
          </div>
        </div>
      </section>

      {/* 3 · Live demo: show it working before explaining it */}
      <section className="section" id="demo" aria-labelledby="demo-h">
        <p className="eyebrow">Live demo</p>
        <h2 id="demo-h">Break our exam portal. Watch the agent handle it.</h2>
        <div className="prose muted">
          <p>
            A real Django exam portal that we run so you can break it. Each button triggers one bug we planted on purpose. The crash reaches
            JaagteRaho exactly as one from your app would, and the logbook beside the buttons shows what the owner gets, with a timer: the decision,
            the wake-up call, the cause and a checked fix. No sign-up. Nothing is pre-recorded unless it is marked &ldquo;replayed&rdquo;.
          </p>
        </div>
        <ol className="see" aria-label="What you will see">
          <li>
            <b>Error received</b>
            <span>the real Python error and the page it broke</span>
          </li>
          <li>
            <b>Decision</b>
            <span>a stamp (woke owner or notified) and the rule that chose it{at(ev?.median_seconds.alert)}</span>
          </li>
          <li>
            <b>Wake-up call</b>
            <span>the voice note the owner&apos;s phone gets; press play to hear it</span>
          </li>
          <li>
            <b>Cause</b>
            <span>in plain words, with file and line{at(ev?.median_seconds.cause)}</span>
          </li>
          <li>
            <b>Fix</b>
            <span>the change and its checks{at(ev?.median_seconds.fix)}. If every check passed, Approve makes the same button work again</span>
          </li>
        </ol>
        <BreakIt country={country && /^[A-Z]{2}$/.test(country) ? country : null} />
      </section>

      {/* 4 · Why it exists: the builder lived the problem */}
      <section className="section" id="why" aria-labelledby="why-h">
        <h2 id="why-h">Why I built this: I am the person it wakes</h2>
        <div className="story">
          <div className="prose">
            <p>
              I run <a href="https://faurus.app">Faurus</a>, a coding and exam platform that colleges use: about 11,000 accounts, one engineer.
              Its server errors went to a log file nobody read.
            </p>
            <p>
              If something broke during a live exam at 2 am, I heard about it the next morning, from a student. By then the exam was over, and the
              students who could not submit had already lost their attempt.
            </p>
            <p>
              Error trackers collect errors. They do not decide which one is worth waking a tired person for, find the cause, or write the fix. For
              one person running a live product, that is the whole job, and it happens at night.
            </p>
            <p>
              Students, freelancers and solo founders now ship real products, often written with AI help, and nobody is on call for them after
              launch. JaagteRaho (Hindi for &ldquo;stay awake&rdquo;, the night watchman&apos;s call) is the one who stays up, so you only get up
              when you are really needed.
            </p>
            <p className="muted">Anant Vardhan Pandey, founder of Faurus</p>
          </div>
          <ul className="facts" aria-label="What it does for you">
            <li>
              <b>Decides</b>
              <span>whether an error is worth waking you, with rules you can read</span>
            </li>
            <li>
              <b>Explains</b>
              <span>the cause in plain words, with the file and line</span>
            </li>
            <li>
              <b>Waits</b>
              <span>with a checked fix that only you can approve</span>
            </li>
          </ul>
        </div>
      </section>

      {/* 5 · How it works */}
      <section className="section" id="how" aria-labelledby="how-h">
        <h2 id="how-h">What the agent does with each error</h2>
        <ol className="steps">
          <li>
            <Icon name="inbox" />
            <b>1 · An error arrives</b>
            <span>
              Your app sends its crash reports through the free, open-source Sentry SDK (one setting), or your host forwards its logs. Personal data
              is masked before anything is stored, and the same crash 50 times becomes one problem with a count.
            </span>
          </li>
          <li>
            <Icon name="rules" />
            <b>2 · Rules decide: wake, message or wait</b>
            <span>
              Claude Haiku answers fixed questions about the error five times: is it noise, how severe is it, is a user blocked. Then written rules,
              not the AI, pick what happens. The rules are below.
            </span>
          </li>
          <li>
            <Icon name="explain" />
            <b>3 · Claude explains the cause</b>
            <span>
              Claude Sonnet reads the failing file, the files it calls and the last change you deployed. You get the cause in plain words, the file
              and line, and the commit that probably caused it.
            </span>
          </li>
          <li>
            <Icon name="check" />
            <b>4 · A checked fix waits for you</b>
            <span>
              A small fix must pass 6 code checks (it applies cleanly, stays small, avoids login, payment and grading code, adds no packages or
              links, is still valid code) and a second Claude review. You approve it and apply it yourself.
            </span>
          </li>
        </ol>

        <div className="rules">
          <h3 id="rules-h">The rules, in plain words</h3>
          <p className="muted small">
            Checked from top to bottom; the first one that matches wins. You mark which pages are critical, and <code className="mono">/exam 2h</code>{" "}
            on Telegram tells it an exam is running. No AI answer can lower the first three rules. Source code:{" "}
            <a href={DECIDE}>watcher/src/pipeline/decide.ts</a>.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="nums" aria-labelledby="rules-h">
              <thead>
                <tr>
                  <th scope="col">If</th>
                  <th scope="col">Then JaagteRaho will</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map(([when, then, kind]) => (
                  <tr key={when}>
                    <td>{when}</td>
                    <td className={`then ${kind}`}>{then}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ margin: 0 }}>
          <Link href="/how">Every step in detail: setup, what reaches your phone, the bot&apos;s commands and the cost →</Link>
        </p>
      </section>

      {/* 6 · Proof */}
      <section className="section" id="proof" aria-labelledby="proof-h">
        <h2 id="proof-h">Measured, not claimed</h2>
        <div className="prose muted">
          <p>
            Every number here comes from a script in the <a href={REPO}>repository</a>, measured on {benchDate}. We count the mistakes,
            not only the hits. The sample apps are small and generated, and the real-bug set is 30 cases; these numbers
            claim nothing beyond those runs.
          </p>
        </div>
        <div className="measured six">
          <div>
            <strong>
              {bench.alerted} of {bench.bugs}
            </strong>
            <span>
              planted bugs in 7 sample apps reached the owner; {bench.noise_quiet} of {bench.noise} harmless errors stayed quiet
            </span>
          </div>
          <div>
            <strong>{bench.shown_wrong} wrong</strong>
            <span>among the {bench.shown} fixes shown to the owner, each judged by a hidden test JaagteRaho never saw</span>
          </div>
          <div>
            <strong>
              {real.in_trace.right_file} of {real.in_trace.cases}
            </strong>
            <span>real bugs from {real.projects} open-source projects: right file, when the bug is in a file the error names</span>
          </div>
          <div>
            <strong>
              {bench.exam_woke} of {bench.exam_cases}
            </strong>
            <span>bugs on a critical route during an exam woke the owner; no AI answer can lower that rule</span>
          </div>
          <div>
            <strong>
              {bench.median_decision_seconds} s · {bench.median_fix_seconds} s
            </strong>
            <span>median time from error to decision, and to a checked fix</span>
          </div>
          <div>
            <strong>${bench.cost_per_error_usd.toFixed(3)}</strong>
            <span>AI cost per error, for deciding, diagnosing and reviewing the fix</span>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          It also watches itself: its own crashes go through the same pipeline. On 13 Nov we sent malformed input to every public endpoint. It caught
          four crashes in its own code, explained each with file and line, and we applied three of its fixes as written.
        </p>
        {ev && ev.runs > 0 && (
          <p className="muted" style={{ margin: 0 }}>
            On the live demo so far: {ev.runs} {ev.runs === 1 ? "run" : "runs"} by {ev.people} {ev.people === 1 ? "person" : "people"}
            {ev.countries.length > 0 ? `, from ${ev.countries.length} ${ev.countries.length === 1 ? "country" : "countries"}` : ""}, counted
            live.
          </p>
        )}
        <p style={{ margin: 0 }}>
          <Link href="/evidence">See every number and how it was measured →</Link>
        </p>
      </section>

      {/* 7 · Connect + safety */}
      <section className="section" id="connect" aria-labelledby="connect-h">
        <h2 id="connect-h">Connect your app in 2 minutes</h2>
        <div className="ways">
          <div>
            <b>1 · Name your app</b>
            <code className="mono">/new myapp</code>
            <span>
              Send it to our Telegram bot, or type the name on the <Link href="/connect">Connect page</Link>. You get a private address for your
              errors and $5 of free AI credit.
            </span>
          </div>
          <div>
            <b>2 · Run one command</b>
            <code className="mono">npx jaagteraho init</code>
            <span>
              In your project folder. It finds Django, Flask, FastAPI, Express or Next.js, shows every change before making it, adds the Sentry SDK and
              sends a test error. Telegram replies &ldquo;connected&rdquo;.
            </span>
          </div>
          <div>
            <b>Or · no code at all</b>
            <code className="mono">log drain → your logs address</code>
            <span>Paste the address into your host (Vercel, Heroku, Render). It picks out Python and Node.js errors and drops every other line.</span>
          </div>
        </div>
        <div className="actions">
          <Link className="btn" href="/connect">
            Connect your app
          </Link>
          <Link className="btn ghost" href="/paste">
            Or try it on one error first
          </Link>
        </div>

        <h3 id="safety-h" style={{ marginTop: 16 }}>
          Safety: what it will never do
        </h3>
        <ul className="safety" aria-labelledby="safety-h">
          <li>
            <b>Never writes your code.</b> Fixes arrive as a diff. You apply and deploy them yourself.
          </li>
          <li>
            <b>Read-only access.</b> It reads only the files an error points to. Its GitHub app cannot write.
          </li>
          <li>
            <b>Personal data masked.</b> No request bodies, cookies, headers or IP addresses are kept. Emails, phone numbers and keys are masked.
          </li>
          <li>
            <b>Spend caps.</b> Repeats are grouped before any AI call, each app has daily limits, and total spend has a hard cap.
          </li>
          <li>
            <b>A person approves every fix.</b> A fix that touches login, payments or grading is never offered at all.
          </li>
        </ul>
        <p className="muted small">
          Details: <Link href="/privacy">what it keeps</Link> and <Link href="/how">how each step works</Link>.
        </p>
      </section>
    </>
  );
}
