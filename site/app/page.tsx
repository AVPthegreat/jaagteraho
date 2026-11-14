import Link from "next/link";
import { headers } from "next/headers";
import benchmarks from "./evidence/benchmarks.json";
import { DECIDE_SRC, GATE_SRC, HEAL_SRC, VIDEO_URL } from "./site";
import { AlertCard } from "./ui/alert-card";
import { DemoSection } from "./ui/demo-section";
import { HeroStage } from "./ui/hero-stage";
import { Icon } from "./ui/icons";
import { getEvidence } from "./watcher";

/* The rule table from decide.ts, in plain words, in the order the code checks it. */
const RULES: Array<[string, string, "wake" | "notify" | "quiet"]> = [
  ["A critical flow (exam submission, login, payment) fails while an exam is running", "Wake you", "wake"],
  ["A critical flow fails 3 or more times in 10 minutes while you are away", "Wake you", "wake"],
  ["Any other failure in a critical flow", "Message you", "notify"],
  ["Claude rates it an outage or data loss", "Wake you", "wake"],
  ["It blocks users from doing something", "Message you", "notify"],
  ["A feature works worse but still works", "Message you, or the 08:00 summary if you are away", "notify"],
  ["Minor or cosmetic", "The 08:00 summary", "quiet"],
  ["Clearly noise (a bot scanner, a missing favicon) and low severity", "Ignore it", "quiet"],
  ["5 or more different people hit it in one hour", "Never quiet: at least a message", "notify"],
  ["The AI could not answer", "Message you; never ignore it", "notify"],
];

const d = (n: number) => ({ "--d": n }) as React.CSSProperties;

export default async function Home() {
  const country = (await headers()).get("x-vercel-ip-country");
  const ev = await getEvidence();
  const bench = benchmarks.jr_bench.after;
  const real = benchmarks.real_bugs.before;
  const benchDate = new Date(benchmarks.measured_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <HeroStage>
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" /> An AI on-call agent for apps with nobody on call
        </p>
        <h1 id="hero-h" className="display hero-title">
          Your app breaks at 2&nbsp;am. <em>If you don&apos;t wake up, JaagteRaho heals&nbsp;it.</em>
        </h1>
        <p className="hero-sub">
          It reads every error from your live app, wakes you only when real users are hurt, explains the cause with the file and line, and writes a fix
          that must pass six code checks and a review.
        </p>
        <p className="safety-line">
          <Icon name="shield" />
          <span>You approve every fix, or let it heal itself under rules you set.</span>
        </p>
        <div className="actions">
          <a className="btn btn-lg" href="#demo">
            Break our demo exam portal <span className="arrow" aria-hidden="true">→</span>
          </a>
          <Link className="btn btn-ghost btn-lg" href="/connect">
            Connect your app in 2 minutes
          </Link>
          {VIDEO_URL && (
            <a className="textlink" href={VIDEO_URL}>
              Watch the video
            </a>
          )}
        </div>
        <p className="hero-meta">
          <span>No sign-up for the demo</span>
          <span>Python and Node.js apps</span>
          <span>Free during HackGlobal 2026</span>
          <span>Hosted on Vultr</span>
        </p>
      </HeroStage>

      {/* Measured proof, right under the promise */}
      <section className="proof" aria-labelledby="proof-h">
        <div className="frame">
          <h2 id="proof-h" className="sr-only">
            Measured results
          </h2>
          <ul className="proof-strip">
            <li data-rv>
              <b>
                {bench.alerted}
                <small>/{bench.bugs}</small>
              </b>
              <span>planted bugs reached the owner, each triggered for real</span>
            </li>
            <li data-rv style={d(1)}>
              <b>{bench.shown_wrong}</b>
              <span>wrong fixes among the {bench.shown} shown, judged by hidden tests it never saw</span>
            </li>
            <li data-rv style={d(2)}>
              <b>
                {bench.noise_quiet}
                <small>/{bench.noise}</small>
              </b>
              <span>harmless errors kept quiet: nobody woken for nothing</span>
            </li>
            <li data-rv style={d(3)}>
              <b>
                {bench.median_decision_seconds}
                <small> s</small>
              </b>
              <span>median time from error to a decision</span>
            </li>
            <li data-rv style={d(4)}>
              <b>
                {bench.median_fix_seconds}
                <small> s</small>
              </b>
              <span>median time to a fix that passed every check</span>
            </li>
          </ul>
          <p className="proof-note" data-rv style={d(5)}>
            JR-Bench: {bench.bugs} planted bugs and {bench.noise} harmless errors in 7 sample apps, measured {benchDate} by scripts in the repository,
            mistakes counted. On {real.in_trace.cases} real bugs from open-source projects, it named the right file {real.in_trace.right_file} of{" "}
            {real.in_trace.cases} times when the bug was in a file the traceback shows.{" "}
            <Link className="textlink" href="/evidence">
              How each number was measured
            </Link>
          </p>
        </div>
      </section>

      {/* The centrepiece: break it yourself */}
      <section className="section demo-band" id="demo" aria-labelledby="demo-h">
        <div className="frame">
          <DemoSection ev={ev} country={country && /^[A-Z]{2}$/.test(country) ? country : null} headingId="demo-h" />
        </div>
      </section>

      {/* How it works: four steps */}
      <section className="section" id="how" aria-labelledby="how-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              How it works
            </p>
            <h2 id="how-h" className="h-section" data-rv style={d(1)}>
              From a crash to a checked fix, <em>in about twelve seconds.</em>
            </h2>
          </div>
          <ol className="pipeline" data-flow>
            <li className="flow-step" data-rv>
              <span className="flow-n">01</span>
              <Icon name="ear" />
              <h3>Hears every error</h3>
              <p>Through the free, open-source Sentry SDK (one setting) or your host&apos;s log drain. Personal data is masked; 50 repeats become one incident.</p>
              <pre className="flow-vis code-vis" aria-hidden="true">
                <span className="soft">File &quot;portal/submissions.py&quot;, line 14</span>
                {"\n"}
                <span className="err">KeyError: &apos;language&apos;</span>
              </pre>
            </li>
            <li className="flow-step" data-rv style={d(1)}>
              <span className="flow-n">02</span>
              <Icon name="scale" />
              <h3>Decides with rules you can read</h3>
              <p>Claude Haiku answers fixed questions five times. Then written rules, not the AI, pick one of four actions.</p>
              <span className="flow-vis pills" aria-hidden="true">
                <span className="pill wake">
                  <i />
                  Wake you
                </span>
                <span className="pill notify">
                  <i />
                  Message
                </span>
                <span className="pill calm">
                  <i />
                  08:00 summary
                </span>
                <span className="pill calm">
                  <i />
                  Ignore
                </span>
              </span>
            </li>
            <li className="flow-step" data-rv style={d(2)}>
              <span className="flow-n">03</span>
              <Icon name="search" />
              <h3>Explains the cause</h3>
              <p>Claude Sonnet reads the failing file, what it calls and your last deploy. You get plain words, the file and the line.</p>
              <span className="flow-vis cause-vis" aria-hidden="true">
                <span>The Submit button never says which language the code is in.</span>
                <code>portal/submissions.py:14</code>
              </span>
            </li>
            <li className="flow-step" data-rv style={d(3)}>
              <span className="flow-n">04</span>
              <Icon name="wrench" />
              <h3>Fixes, or heals</h3>
              <p>A small fix must pass six code checks and a second review. You approve it, or your rule lets it heal while you sleep.</p>
              <span className="flow-vis ticks" aria-hidden="true">
                {["applies", "small", "safe areas", "no packages", "valid", "reviewed"].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </span>
            </li>
          </ol>

          <div className="rules-split">
            <div className="rules-col">
              <h3 id="rules-h" className="h-sub" data-rv>
                The rules, in plain words
              </h3>
              <p className="soft" data-rv style={d(1)}>
                Checked top to bottom; the first match wins. You mark which pages are critical, and <code>/exam 2h</code> tells it an exam is running.
                No AI answer can lower the critical-flow rules. Source: <a href={DECIDE_SRC}>decide.ts</a>.
              </p>
              <ol className="rules" aria-labelledby="rules-h" data-rv style={d(2)}>
                {RULES.map(([when, then, kind], i) => (
                  <li key={when}>
                    <span className="rule-n">{i + 1}</span>
                    <span className="rule-if">{when}</span>
                    <span className={`pill ${kind === "quiet" ? "calm" : kind}`}>
                      <i />
                      {then}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <figure className="phone-col" aria-labelledby="alert-cap" data-rv style={d(1)}>
              <div className="phone">
                <AlertCard />
              </div>
              <figcaption id="alert-cap" className="small soft">
                Example alert, as it reaches the owner on Telegram. Press its buttons. A spoken wake-up follows, and a phone call where the owner turned
                calls on (press 1 to acknowledge).
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Self-healing and safety */}
      <section className="section safety-band" id="safety" aria-labelledby="safety-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              Safety and self-healing
            </p>
            <h2 id="safety-h" className="h-section" data-rv style={d(1)}>
              You approve every fix, <em>or let it heal itself under rules you set.</em>
            </h2>
          </div>

          <div className="modes" role="list" aria-label="Your heal rule">
            <div className="mode" role="listitem" data-rv>
              <code>/heal ask</code>
              <h3>Wait for me</h3>
              <p>The default. Nothing goes in until you approve it.</p>
              <span className="mode-tag">Default</span>
            </div>
            <div className="mode lit" role="listitem" data-rv style={d(1)}>
              <code>/heal auto 10m</code>
              <h3>Heal if I sleep through it</h3>
              <p>If a wake-up is not acknowledged in 10 minutes (you pick the minutes), a recommended fix goes in on its own.</p>
            </div>
            <div className="mode" role="listitem" data-rv style={d(2)}>
              <code>/heal now</code>
              <h3>Heal right away</h3>
              <p>For the routes you name, or for all of them. <code>/heal off</code> sends fixes as diffs only.</p>
            </div>
          </div>

          <p className="rail-title" data-rv>
            Whatever rule you pick
          </p>
          <ul className="guards">
            <li data-rv>
              <Icon name="check" />
              <b>Only fully checked fixes heal</b>
              <span>All six code checks passed and every review vote agreed. Nothing that adds an import, a network call, a process or a file write.</span>
            </li>
            <li data-rv style={d(1)}>
              <Icon name="lock" />
              <b>Never in protected code</b>
              <span>Login, sessions, tokens, admin and roles, payments, exams, grading, migrations, settings, config, CI and infrastructure.</span>
            </li>
            <li data-rv style={d(2)}>
              <Icon name="key" />
              <b>Only errors your server signs</b>
              <span>Errors must carry your app&apos;s server-only secret, so no one who copies a public key from a web page can steer a fix.</span>
            </li>
            <li data-rv style={d(3)}>
              <Icon name="branch" />
              <b>Behind your own checks</b>
              <span>A heal is a pull request that merges only when your branch requires status checks and they pass. Otherwise it waits for you.</span>
            </li>
            <li data-rv style={d(4)}>
              <Icon name="undo" />
              <b>Proved, or rolled back</b>
              <span>Watched for 30 minutes after your deploy. If errors are not down by half, it is reverted, you are woken and healing pauses 12 hours.</span>
            </li>
            <li data-rv style={d(5)}>
              <Icon name="gauge" />
              <b>Capped, and undoable</b>
              <span>At most 2 heals per app a night unless you raise it. Every heal comes with one-tap Undo and a full logbook.</span>
            </li>
          </ul>
          <p className="small soft source-line" data-rv>
            The rules are code: <a href={HEAL_SRC}>heal.ts</a> and <a href={GATE_SRC}>gate.ts</a>. Personal data is masked before anything is stored;{" "}
            <Link href="/privacy">what it keeps</Link>.
          </p>
        </div>
      </section>

      {/* Why: the builder lived it */}
      <section className="section story" id="why" aria-labelledby="why-h">
        <div className="frame story-grid">
          <div className="story-side" data-rv>
            <p className="eyebrow">Why it exists</p>
            <div className="story-clock" aria-hidden="true">
              02<span>:</span>00
            </div>
            <ul className="story-facts">
              <li>
                <b>~11,000</b> accounts on Faurus
              </li>
              <li>
                <b>1</b> engineer
              </li>
              <li>
                <b>Now</b> watched by JaagteRaho
              </li>
            </ul>
          </div>
          <article className="letter">
            <h2 id="why-h" className="h-section" data-rv>
              &ldquo;It broke during an exam at 2&nbsp;am. <em>A student told me the next morning.</em>&rdquo;
            </h2>
            <p data-rv>
              I run <a href="https://faurus.app">Faurus</a>, a coding and exam platform that colleges use: about 11,000 accounts, and one engineer, me.
              Its server errors went to a log file nobody read.
            </p>
            <p data-rv>
              When something broke during a live exam at night, I heard about it the next morning, from a student. By then the exam was over, and the
              students who could not submit had already lost their attempt.
            </p>
            <p data-rv>
              Error trackers collect errors. They do not decide which one is worth waking a tired person for, find the cause, or write the fix. For one
              person running a live product, that is the whole job, and it happens at night. So I built the watchman I needed. Faurus is now connected
              to it for real.
            </p>
            <p className="signoff" data-rv>
              <b>Anant Vardhan Pandey</b>
              <span>Founder of Faurus, builder of JaagteRaho</span>
            </p>
          </article>
        </div>
      </section>

      {/* Connect */}
      <section className="section connect-band" id="connect" aria-labelledby="connect-h">
        <div className="frame">
          <div className="section-head split-head">
            <div>
              <p className="eyebrow" data-rv>
                Connect
              </p>
              <h2 id="connect-h" className="h-section" data-rv style={d(1)}>
                On your app <em>in two minutes.</em>
              </h2>
            </div>
            <div className="actions" data-rv style={d(2)}>
              <Link className="btn" href="/connect">
                Connect your app <span className="arrow" aria-hidden="true">→</span>
              </Link>
              <Link className="textlink" href="/paste">
                Or try it on one error first
              </Link>
            </div>
          </div>
          <ol className="steps3">
            <li data-rv>
              <span className="flow-n">1</span>
              <h3>Name your app</h3>
              <pre className="term">
                <span className="soft">telegram ›</span> /new myapp
              </pre>
              <p>
                Or type the name on the <Link href="/connect">Connect page</Link>. You get a private address for your errors and $5 of free AI credit.
              </p>
            </li>
            <li data-rv style={d(1)}>
              <span className="flow-n">2</span>
              <h3>Run one command</h3>
              <pre className="term">
                <span className="soft">$</span> npx jaagteraho init
              </pre>
              <p>Finds Django, Flask, FastAPI, Express or Next.js, shows every change before making it, and sends a test error. Telegram says connected.</p>
            </li>
            <li data-rv style={d(2)}>
              <span className="flow-n">3</span>
              <h3>Or no code at all</h3>
              <pre className="term">
                <span className="soft">log drain →</span> your logs address
              </pre>
              <p>Paste it into your host (Vercel, Heroku, Render). It picks out Python and Node.js errors and drops every other line.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* The closing sentence: its blank is the form */}
      <section className="close" aria-labelledby="close-h">
        <form className="frame blank-form" action="/connect" method="get">
          <h2 id="close-h" className="blank">
            Put a night watchman on{" "}
            <label htmlFor="close-name" className="sr-only">
              App name
            </label>
            <input id="close-name" name="name" type="text" placeholder="your app" maxLength={40} autoComplete="off" />{" "}
            <button type="submit">
              tonight <span aria-hidden="true">→</span>
            </button>
          </h2>
          <p className="soft">Next: add its repository if you like, pick your heal rule and get your setup command. Free during HackGlobal 2026.</p>
        </form>
      </section>
    </>
  );
}
