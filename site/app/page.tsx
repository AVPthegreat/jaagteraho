import Link from "next/link";
import { headers } from "next/headers";
import { BreakIt } from "./break-it";
import { getEvidence } from "./watcher";
import benchmarks from "./evidence/benchmarks.json";
import { AlertCard, Diff, SUBMIT_DIFF } from "./ui/alert-card";
import { Bars } from "./ui/bars";

const REPO = "https://github.com/AVPthegreat/jaagteraho";
const DECIDE = `${REPO}/blob/main/watcher/src/pipeline/decide.ts`;

const secs = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v} s`);

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

/* The six code checks every fix must pass (watcher/src/pipeline/gate.ts). */
const CHECKS = [
  "Applies exactly to your real file",
  "Touches only files it was shown",
  "At most 3 files and 40 lines",
  "No login, payments or grading code",
  "No new packages or links",
  "Still valid code",
];

const TRACEBACK = `Traceback (most recent call last):
  File "portal/views.py", line 35, in submit_code
    return JsonResponse(prepare_submission(data))
  File "portal/submissions.py", line 14, in prepare_submission
    language = data["language"]
KeyError: 'language'`;

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
      {/* 02:00 · The problem, and the product answering it */}
      <section className="hero field-night" aria-labelledby="hero-h">
        <div className="frame grid">
          <h1 id="hero-h" className="display hero-title">
            Your app breaks at 2&nbsp;am.
          </h1>
          <p className="lead hero-sub">If you don&apos;t wake up, JaagteRaho heals it.</p>
          <div className="hero-left">
            <p>
              An AI agent that reads every error from your live app, wakes you only when real users are hurt, tells you the cause with the file and
              line, and writes a fix that must pass six code checks and a review. <b>You approve every fix, or let it heal on its own under rules you set.</b>
            </p>
            <div className="actions">
              <a className="btn" href="#demo">
                Break our demo app now <span className="arrow">→</span>
              </a>
              <Link className="textlink" href="/connect">
                Connect your app in 2 minutes
              </Link>
            </div>
            <p className="small soft">
              For students, freelancers and solo founders who run a live product alone. Python and Node.js apps. No sign-up to try the demo; free
              during HackGlobal 2026.
            </p>
          </div>
          <figure className="stage" aria-labelledby="alert-cap">
            <figcaption id="alert-cap">
              Example alert: what reaches your phone. Press its buttons. On Telegram it comes with a spoken wake-up call; you can trigger the same
              bug <a href="#demo">in the live demo below</a>.
            </figcaption>
            <AlertCard />
          </figure>
        </div>
      </section>

      {/* The headline numbers, drawn from the benchmark itself */}
      <section className="stats field-navy" aria-labelledby="stats-h">
        <div className="frame grid stats-top">
          <div className="stats-figure">
            <p className="display" data-rv>
              {bench.alerted} of {bench.bugs}
            </p>
            <h2 id="stats-h" data-rv style={{ "--d": 1 } as React.CSSProperties}>
              planted bugs reached the owner, each triggered for real
            </h2>
          </div>
          <ul className="stats-list">
            <li data-rv style={{ "--d": 1 } as React.CSSProperties}>
              <b>{bench.shown_wrong} wrong</b>
              <span>among the {bench.shown} fixes shown to the owner, each judged by a hidden test JaagteRaho never saw</span>
            </li>
            <li data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <b>
                {bench.noise_quiet} of {bench.noise} kept quiet
              </b>
              <span>harmless errors (bot scanners, a missing favicon): nobody woken for nothing</span>
            </li>
            <li data-rv style={{ "--d": 3 } as React.CSSProperties}>
              <b>
                {bench.exam_woke} of {bench.exam_cases} woke the owner
              </b>
              <span>bugs on a critical route during an exam; no AI answer can lower that rule</span>
            </li>
            <li data-rv style={{ "--d": 4 } as React.CSSProperties}>
              <b>
                {real.in_trace.right_file} of {real.in_trace.cases} right file
              </b>
              <span>real bugs from {real.projects} open-source projects, when the bug is in a file the error names</span>
            </li>
            <li data-rv style={{ "--d": 5 } as React.CSSProperties}>
              <b>
                {bench.median_decision_seconds} s · {bench.median_fix_seconds} s · ${bench.cost_per_error_usd.toFixed(3)}
              </b>
              <span>
                median time to a decision and to a checked fix, and the AI cost per error. Measured on {benchDate}, mistakes included.{" "}
                <a href="#proof">Every number →</a>
              </span>
            </li>
          </ul>
        </div>
        <Bars />
      </section>

      {/* Live demo: show it working before explaining it */}
      <section className="section" id="demo" aria-labelledby="demo-h">
        <div className="frame">
          <div className="grid demo-head">
            <h2 id="demo-h" data-rv>
              Break our exam portal.
            </h2>
            <p className="lead" data-rv style={{ "--d": 1 } as React.CSSProperties}>
              Watch the agent handle it.
            </p>
            <div className="prose soft" data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <p>
                A real Django exam portal that we run so you can break it. Each button triggers one bug we planted on purpose. The crash reaches
                JaagteRaho exactly as one from your app would, and the logbook beside the buttons shows what the owner gets, with a timer: the
                decision, the wake-up call, the cause and a checked fix. No sign-up. Nothing is pre-recorded unless it is marked &ldquo;replayed&rdquo;.
              </p>
            </div>
          </div>
          <BreakIt
            country={country && /^[A-Z]{2}$/.test(country) ? country : null}
            see={
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
                  <span>
                    the change and its checks{at(ev?.median_seconds.fix)}. If every check passed and its test proved it, it heals on its own (or waits
                    for your Approve, if you turn that off) and the same button works again
                  </span>
                </li>
              </ol>
            }
          />
        </div>
      </section>

      {/* Why it exists: the builder lived the problem */}
      <section className="section field-surface" id="why" aria-labelledby="why-h">
        <div className="frame">
          <article className="letter">
            <h2 id="why-h" data-rv>
              Why I built this: I am the person it wakes
            </h2>
            <p data-rv>
              I run <a href="https://faurus.app">Faurus</a>, a coding and exam platform that colleges use: about 11,000 accounts, one engineer. Its
              server errors went to a log file nobody read.
            </p>
            <p data-rv>
              If something broke during a live exam at 2 am, I heard about it the next morning, from a student.{" "}
              <span className="mark">By then the exam was over</span>, and the students who could not submit had already lost their attempt.
            </p>
            <figure className="breakout" data-rv>
              <img
                src="/assets/west-bengal-joint-entrance-examination-howrah-2011-2.jpg"
                alt="Families waiting in the yard of an exam centre in Howrah while students sit an entrance exam inside"
                width={1920}
                height={1440}
                loading="lazy"
              />
              <figcaption className="small soft">Exam day outside an entrance-exam centre in Howrah, West Bengal.</figcaption>
            </figure>
            <p data-rv>
              Error trackers collect errors. They do not decide which one is worth waking a tired person for, find the cause, or write the fix. For one
              person running a live product, that is the whole job, and it happens at night.
            </p>
            <p data-rv>
              Students, freelancers and solo founders now ship real products, often written with AI help, and nobody is on call for them after launch.
              JaagteRaho (Hindi for &ldquo;stay awake&rdquo;, the night watchman&apos;s call) is the one who stays up, so you only get up when you are
              really needed.
            </p>
            <p className="signoff" data-rv>
              <b>Anant Vardhan Pandey</b>
              <span className="small soft">founder of Faurus</span>
            </p>
          </article>
        </div>
      </section>

      <figure className="night-band">
        <img
          data-drift
          src="/assets/navi-mumbai-night.jpg"
          alt="Office towers in Navi Mumbai at night, a few windows still lit above an empty road"
          width={1920}
          height={2560}
          loading="lazy"
        />
        <figcaption className="small">Navi Mumbai, at night. Our watcher runs on a server in Mumbai.</figcaption>
      </figure>

      {/* How it works: what you give, and what comes back */}
      <section className="section" id="how" aria-labelledby="how-h">
        <div className="frame">
          <ul className="grid trio" aria-label="What it does for you">
            <li data-rv>
              <b>Decides</b>
              <span>whether an error is worth waking you, with rules you can read</span>
            </li>
            <li data-rv style={{ "--d": 1 } as React.CSSProperties}>
              <b>Explains</b>
              <span>the cause in plain words, with the file and line</span>
            </li>
            <li data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <b>Heals</b>
              <span>with a checked fix you approve, or on its own under rules you set</span>
            </li>
          </ul>

          <div className="grid">
            <div className="cr">
              <h2 id="how-h" data-rv>
                What the agent does with each error
              </h2>

              <div className="exchange">
                <h3 data-rv>First, an error arrives.</h3>
                <p data-rv>
                  Your app sends its crash reports through the free, open-source Sentry SDK (one setting), or your host forwards its logs. Personal
                  data is masked before anything is stored, and the same crash 50 times becomes one problem with a count.
                </p>
                <pre className="call" data-rv>
                  <code>{TRACEBACK}</code>
                </pre>
                <div className="response panel-ui" data-ui data-rv>
                  <span className="stamp-row">
                    <b>Error received</b>
                    <span className="tag">masked</span>
                    <span className="tag">grouped</span>
                  </span>
                  <span className="muted">KeyError: &apos;language&apos; · /api/submit · exam-portal</span>
                </div>
              </div>

              <div className="exchange">
                <h3 data-rv>Then rules decide: wake, message or wait.</h3>
                <p data-rv>
                  Claude Haiku answers fixed questions about the error five times: is it noise, how severe is it, is a user blocked. Then written
                  rules, not the AI, pick what happens. The rules are below.
                </p>
                <pre className="call" data-rv>
                  <code>/exam 2h</code>
                </pre>
                <div className="response panel-ui" data-ui data-rv>
                  <span className="stamp-row">
                    <span className="stamp wake" style={{ animation: "none" }}>
                      Woke owner
                    </span>
                    <b>Rule 2: a critical flow failing during an exam</b>
                  </span>
                  <span className="muted">You told it an exam is running. No AI answer can lower this rule.</span>
                </div>
              </div>

              <div className="exchange">
                <h3 data-rv>Next, Claude explains the cause.</h3>
                <p data-rv>
                  Claude Sonnet reads the failing file, the files it calls and the last change you deployed. You get the cause in plain words, the
                  file and line, and the commit that probably caused it.
                </p>
                <pre className="call" data-rv>
                  <code>{`# portal/submissions.py, line 14
language = data["language"]`}</code>
                </pre>
                <div className="response panel-ui" data-ui data-rv>
                  <b>Cause, in plain words</b>
                  <span>The Submit button never says which language the code is in, and the server insists on knowing it.</span>
                  <span className="muted">portal/submissions.py · line 14 · likely</span>
                </div>
              </div>

              <div className="exchange final">
                <h3 data-rv>Last, a checked fix: you approve it, or it heals.</h3>
                <p data-rv>
                  A small fix must pass 6 code checks (it applies cleanly, stays small, avoids login, payment and grading code, adds no packages or
                  links, is still valid code) and a second Claude review. Then your rule decides: you approve it, or, if you sleep through the
                  wake-up, it goes in on its own as a pull request that merges only after your required checks pass. If the errors don&apos;t drop
                  after your deploy, it is undone and you are woken again.
                </p>
                <pre className="call" data-rv>
                  <code>/heal auto 10m</code>
                </pre>
                <div className="response panel-ui" data-ui data-rv>
                  <span className="stamp-row">
                    <b>Fix proposed</b>
                    <span className="tag ok">all checks passed</span>
                    <span className="tag ok">proved by a test</span>
                    <span className="tag">AI-written</span>
                  </span>
                  <Diff text={SUBMIT_DIFF} />
                  <ul className="checks" aria-label="The six code checks">
                    {CHECKS.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <span className="stamp-row">
                    <b>Healed on its own</b>
                    <span className="tag ok">your rule allowed it</span>
                    <span className="muted">nobody acknowledged in 10 min · one-tap Undo</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid rules">
            <div className="rules-head">
              <h2 id="rules-h" data-rv>
                The rules, in plain words
              </h2>
              <p className="soft" data-rv style={{ "--d": 1 } as React.CSSProperties}>
                Checked from top to bottom; the first one that matches wins. You mark which pages are critical, and <code>/exam 2h</code> on
                Telegram tells it an exam is running. No AI answer can lower the first three rules. Source code:{" "}
                <a href={DECIDE}>watcher/src/pipeline/decide.ts</a>.
              </p>
              <p data-rv style={{ "--d": 2 } as React.CSSProperties}>
                <Link className="textlink" href="/how">
                  Every step in detail: setup, what reaches your phone, the bot&apos;s commands and the cost →
                </Link>
              </p>
            </div>
            <div className="table-wrap" data-rv>
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
        </div>
      </section>

      {/* Proof */}
      <section className="section field-surface" id="proof" aria-labelledby="proof-h">
        <div className="frame grid proof">
          <h2 id="proof-h" data-rv>
            Measured, not claimed
          </h2>
          <div className="prose" data-rv style={{ "--d": 1 } as React.CSSProperties}>
            <p>
              Every number on this page comes from a script in the <a href={REPO}>repository</a>, measured on {benchDate}. We count the mistakes, not
              only the hits. The sample apps are small and generated, and the real-bug set is 30 cases; these numbers claim nothing beyond those
              runs.
            </p>
            <p className="soft">
              It also watches itself: its own crashes go through the same pipeline. On 13 Nov we sent malformed input to every public endpoint. It
              caught four crashes in its own code, explained each with file and line, and we applied three of its fixes as written.
            </p>
            {ev && ev.runs > 0 && (
              <p className="soft">
                On the live demo so far: {ev.runs} {ev.runs === 1 ? "run" : "runs"} by {ev.people} {ev.people === 1 ? "person" : "people"}
                {ev.countries.length > 0 ? `, from ${ev.countries.length} ${ev.countries.length === 1 ? "country" : "countries"}` : ""}, counted live.
              </p>
            )}
            <p>
              <Link className="textlink" href="/evidence">
                See every number and how it was measured →
              </Link>
            </p>
          </div>
          <ul className="names" aria-label="Open-source projects whose real bugs it was tested on" data-rv>
            <li>Tested on real bugs from</li>
            <li>requests</li>
            <li>Flask</li>
            <li>pip</li>
            <li>pytest</li>
            <li>Celery</li>
            <li>black</li>
          </ul>
        </div>
      </section>

      {/* Safety */}
      <section className="section" id="safety" aria-labelledby="safety-h">
        <div className="frame grid safety">
          <div className="safety-head">
            <h2 id="safety-h" data-rv>
              Safety
            </h2>
            <p className="lead" data-rv style={{ "--d": 1 } as React.CSSProperties}>
              You approve every fix, or it heals under rules you set.
            </p>
            <p className="soft" data-rv style={{ "--d": 2 } as React.CSSProperties}>
              Details: <Link href="/privacy">what it keeps</Link> and <Link href="/how">how each step works</Link>.
            </p>
          </div>
          <ul className="safety-list">
            <li data-rv>
              <b>Your rule.</b>
              <span>
                Approve every fix yourself (the default), let it heal if a wake-up goes unanswered for 10 minutes, or heal right away. Set it with{" "}
                <code>/heal</code> on Telegram or when you connect.
              </span>
            </li>
            <li data-rv>
              <b>Only fully checked fixes heal on their own.</b>
              <span>
                All six code checks pass and every review vote agrees. No new imports, network calls, processes, file writes or hidden data. Login,
                sessions, tokens, admin, payments, exams, grading, migrations, settings, config, CI and infrastructure are never touched. At most 2 heals a
                night unless you change it.
              </span>
            </li>
            <li data-rv>
              <b>Only for errors your server signs.</b>
              <span>
                Errors must carry your app&apos;s server-only secret, so nobody who copies the public key from a web page can steer a fix.
              </span>
            </li>
            <li data-rv>
              <b>Through your own checks, with write access you choose to give.</b>
              <span>
                On your app a heal is a pull request that merges by itself only when your branch requires status checks and they pass. Otherwise it waits
                for you, and so does the wake-up call. Without write access you get the ready-to-apply diff.
              </span>
            </li>
            <li data-rv>
              <b>Proved, or undone.</b>
              <span>
                After your deploy it watches the error for 30 minutes. If it comes back at least 3 times and is not down by half, it rolls the fix back,
                wakes you again and stops healing for 12 hours. Every heal comes with one-tap Undo.
              </span>
            </li>
            <li data-rv>
              <b>Reads only what it needs.</b>
              <span>Just the files an error points to. Its GitHub app is read-only.</span>
            </li>
            <li data-rv>
              <b>Personal data masked.</b>
              <span>No request bodies, cookies, headers or IP addresses are kept. Emails, phone numbers and keys are masked.</span>
            </li>
            <li data-rv>
              <b>Spend caps.</b>
              <span>Repeats are grouped before any AI call, each app has daily limits, and total spend has a hard cap.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Connect */}
      <section className="section field-surface" id="connect" aria-labelledby="connect-h">
        <div className="frame">
          <div className="grid ways-head">
            <h2 id="connect-h" data-rv>
              Connect your app in 2 minutes
            </h2>
            <div className="actions" data-rv style={{ "--d": 1 } as React.CSSProperties}>
              <Link className="btn" href="/connect">
                Connect your app <span className="arrow">→</span>
              </Link>
              <Link className="textlink" href="/paste">
                Or try it on one error first
              </Link>
            </div>
          </div>
          <ol className="grid ways">
            <li data-rv>
              <h3>Name your app</h3>
              <pre>
                <code>/new myapp</code>
              </pre>
              <span>
                Send it to our Telegram bot, or type the name on the <Link href="/connect">Connect page</Link>. You get a private address for your errors
                and $5 of free AI credit.
              </span>
            </li>
            <li data-rv style={{ "--d": 1 } as React.CSSProperties}>
              <h3>Run one command</h3>
              <pre>
                <code>npx jaagteraho init</code>
              </pre>
              <span>
                In your project folder. It finds Django, Flask, FastAPI, Express or Next.js, shows every change before making it, adds the Sentry SDK and
                sends a test error. Telegram replies &ldquo;connected&rdquo;.
              </span>
            </li>
            <li data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <h3>Or no code at all</h3>
              <pre>
                <code>log drain → your logs address</code>
              </pre>
              <span>Paste the address into your host (Vercel, Heroku, Render). It picks out Python and Node.js errors and drops every other line.</span>
            </li>
          </ol>
        </div>
      </section>

      {/* The closing sentence: its blank is the form */}
      <section className="section field-night" aria-labelledby="close-h">
        <form className="frame blank-form" action="/connect" method="get">
          <h2 id="close-h" className="blank">
            Put a night watchman on{" "}
            <label htmlFor="close-name" className="sr-only">
              App name
            </label>
            <input id="close-name" name="name" type="text" placeholder="your app" maxLength={40} autoComplete="off" />{" "}
            <button type="submit" aria-label="Connect it tonight">
              tonight
            </button>
          </h2>
          <p className="soft">
            Next you add its repository if you like, pick your heal rule and get your setup command. Free during HackGlobal 2026, with $5 of AI credit.
          </p>
        </form>
      </section>
    </>
  );
}
