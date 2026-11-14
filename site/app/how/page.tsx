import type { Metadata } from "next";
import Link from "next/link";
import { Lantern } from "../ui/lantern";

export const metadata: Metadata = {
  title: "How it works, step by step · JaagteRaho",
  description: "What you see, how to connect your app in five minutes, and exactly what happens when it breaks at night.",
};

const SETUP = [
  {
    t: "Name your app",
    d: (
      <>
        On the <Link href="/connect">Connect page</Link>, type your app&apos;s name. Or open our Telegram bot and send <code>/new myapp</code>. You get a
        private address for your errors and <b>$5 of free AI credit</b>.
      </>
    ),
  },
  {
    t: "Link your Telegram",
    d: <>Tap the link you are given. The bot now knows the app is yours. Until you do this, we make no AI calls for your app.</>,
  },
  {
    t: "Connect your app (pick one way)",
    d: <>Three ways, shown below. Most people use the one command.</>,
    ways: true,
  },
  {
    t: "Let it read your code (optional, recommended)",
    d: (
      <>
        A public repository: give its name. A private one: send <code>/github</code> and install our GitHub app. <b>Read-only</b>: our GitHub app reads
        your code to find the cause and cannot change it. Without this you still get alerts and the likely cause, but no exact fix. Self-healing needs
        write access as well, which you give separately for one repository (see &ldquo;Your heal rule&rdquo; below).
      </>
    ),
  },
  { t: "Deploy once", d: <>Deploy your app as you normally do. You are done. Nothing else to watch, no dashboard to keep open.</> },
];

const NIGHT = [
  {
    t: "The error reaches us",
    d: "Your app sends the crash: the error, the file and line it came from, the page it happened on, and your app version. From log drains we read the same thing out of your logs.",
    meta: "instant",
  },
  {
    t: "We clean it up",
    d: "Only allowed fields are kept. Emails, passwords and cookies are dropped. User IDs are scrambled, so we can count how many people were hit without knowing who. The same crash 50 times becomes one incident with a count of 50.",
    meta: "instant · free",
  },
  {
    t: "The watchman decides",
    d: "Code works out the facts: how often it failed, how many different people, whether it is a critical page (payments, login, exam), whether it is new. Claude Haiku answers fixed questions about it five times. Written rules then pick one of four: wake you, message you, keep it for the morning, or ignore it. Some rules can never be lowered by the AI: a critical page failing during an exam always wakes you.",
    meta: "about 2 s · about $0.0001",
  },
  {
    t: "Your phone gets the alert",
    d: "A Telegram card like the one beside this list. If the decision was \"wake\", a spoken voice message follows so it can actually wake you. The same card updates itself as the next steps finish, so you get one message, not ten.",
    meta: "seconds after the error",
  },
  {
    t: "Claude finds the cause",
    d: "Claude Sonnet reads the error, the failing file from your repository, up to two files that code calls, and the last change you deployed before it broke. It writes the cause in plain words, the exact file and line, a small fix, and a test that would catch this bug again.",
    meta: "about 12 s · about 1 cent",
  },
  {
    t: "The fix is checked",
    d: "Code checks the fix applies cleanly to your real file and is still valid code. Then Claude reviews it again: is it good, does it touch payments or login, could it break something else? The fix gets one of three labels (below). On our demo app we also run Claude's test: it must fail on the broken code and pass on the fixed code.",
    meta: "a few seconds",
  },
  {
    t: "You approve it, or it heals under your rule",
    d: "Tap \"Show fix\" to see the exact change. By default you decide: apply it yourself, or tap Approve where you gave write access. If your rule allows it and nobody acknowledges the wake-up in time, a recommended fix goes in on its own as a pull request that merges only after your required checks pass, and you get \"Healed while you were away\" with the proof and one-tap Undo. Tap \"Diagnosis right\" or \"wrong\" so we learn how often it is right.",
    meta: "your rule decides",
  },
  {
    t: "Morning summary",
    d: "At 8 am India time, if anything happened: how many errors came in, what was decided for each, the top three problems, which fixes are waiting, and what the night cost you.",
    meta: "once a day",
  },
];

const COMMANDS: Array<[string, string]> = [
  ["/new myapp", "Connect another app (up to 3)"],
  ["/status", "Open problems and today's spend"],
  ["/away and /back", "Going offline? /back tells you what happened while you were gone"],
  ["/exam 2h", "Treat the next 2 hours as an exam: any failure on a critical page wakes you"],
  ["/critical /api/checkout checkout", "Mark a page as critical, so failures there always reach you"],
  ["/github and /repo", "Give read access to your code, or change which repository"],
  ["/credits", "How much of your $5 is left"],
  ["/heal", "Your heal rule: /heal ask (approve every fix, the default), /heal auto 10m (heal if a wake-up goes unanswered for 10 min), /heal now, /heal off, /heal max 2"],
  ["/pause and /resume", "Stop or restart all AI calls, fixes, heals and wake-ups"],
];

/* A second example of what reaches the phone: an outage on a checkout, with the commit that caused it. */
function QuizkartAlert() {
  return (
    <figure className="tg whole" data-ui aria-label="Example Telegram alert">
      <div className="tg-top">
        <span className="tg-avatar">
          <Lantern size={24} />
        </span>
        <span>
          <b>JaagteRaho</b>
          <span>bot</span>
        </span>
      </div>
      <div className="tg-chat">
        <div className="tg-msg">
          <p>
            <span className="wake-word">WAKE</span> · quizkart · checkout failing
          </p>
          <p>23 failures in 9 min · 9 people affected in the last hour</p>
          <p>Rule 3: critical flow (checkout) failing repeatedly while you are away</p>
          <p>Claude: severity 4 outage (5/5), user blocked yes (5/5) · uncalibrated</p>
          <p className="gap">
            <b>Last change:</b> Began 38 min after commit 4f2a9c1 &ldquo;update cart total&rdquo; by riya, which changed cart/views.py (in the stack trace).
          </p>
          <p className="gap">
            <b>Cause:</b> The cart total is now a string, so adding the delivery fee to it crashes the checkout.
          </p>
          <p>
            <code>cart/views.py:48</code> · likely
          </p>
          <p>
            <b>Fix:</b> 2 lines · all checks passed · AI-written
          </p>
        </div>
        <div className="tg-keys" aria-hidden="true">
          <span>Why?</span>
          <span>Show fix</span>
          <span className="wide">Acknowledge</span>
          <span>Diagnosis right</span>
          <span>Diagnosis wrong</span>
        </div>
      </div>
      <figcaption className="small" style={{ padding: "0 16px 16px", color: "var(--ui-soft)" }}>
        The card arrives first with &ldquo;working on it&hellip;&rdquo; and fills in as the cause and fix are ready.
      </figcaption>
    </figure>
  );
}

export default function How() {
  return (
    <>
      <section className="page-head field-night" aria-labelledby="how-h">
        <div className="frame grid">
          <h1 id="how-h" className="display">
            How it works
          </h1>
          <p className="lead">Connect once. Then your phone tells you when it matters.</p>
        </div>
      </section>

      <section className="section">
        <div className="frame">
          <div className="prose" style={{ marginBottom: "clamp(88px, 10vw, 160px)" }}>
            <p className="lead">
              JaagteRaho is not a dashboard you keep open. You connect your app once, in about five minutes. After that it watches every error day and
              night, decides which ones deserve you, and tells you on Telegram what broke, why, and how to fix it.
            </p>
          </div>

          <div className="grid doc">
            <h2 id="see-h">
              What you will see
            </h2>
            <div className="body">
              <ul className="labels" aria-labelledby="see-h">
                <li data-rv>
                  <b>Your phone · Telegram</b>
                  <span>
                    The main product. Alert cards with buttons, a voice message when it is serious, a summary every morning, and commands like{" "}
                    <code>/status</code>.
                  </span>
                </li>
                <li data-rv>
                  <b>Your private fix page</b>
                  <span>One page per problem: the cause, the exact code change, and what the safety check said. Opened from the alert.</span>
                </li>
                <li data-rv>
                  <b>This website</b>
                  <span>
                    To sign up, to <Link href="/#demo">try it on our demo app</Link>, to <Link href="/paste">paste an error</Link> you already have, and to
                    see our <Link href="/evidence">test results</Link>.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid doc">
            <h2 id="setup-h">
              Set it up: about 5 minutes, once
            </h2>
            <div className="body">
              <ol className="timeline" aria-labelledby="setup-h">
                {SETUP.map((s) => (
                  <li key={s.t} data-rv>
                    <strong>{s.t}</strong>
                    <p>{s.d}</p>
                    {s.ways && (
                      <ul className="ways-col">
                        <li>
                          <b>One command</b>
                          <pre>
                            <code>npx jaagteraho init</code>
                          </pre>
                          <span>
                            Run it in your project. It detects Django, Flask, FastAPI, Express, Next.js or plain Python/Node, shows every line it will add
                            before adding it, installs the free Sentry error library, and sends a test error. Telegram replies &ldquo;connected&rdquo;.
                          </span>
                        </li>
                        <li>
                          <b>You already use Sentry</b>
                          <pre>
                            <code>SENTRY_DSN=&lt;your JaagteRaho address&gt;</code>
                          </pre>
                          <span>Change one setting. Your existing setup keeps working.</span>
                        </li>
                        <li>
                          <b>No code at all</b>
                          <pre>
                            <code>Log drain → your logs address</code>
                          </pre>
                          <span>Paste the address into Vercel, Heroku or Render. We find crash reports in your logs and drop everything else.</span>
                        </li>
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="section field-night" aria-labelledby="night-h">
        <div className="frame grid doc">
          <div className="night-side">
            <h2 id="night-h">
              When your app breaks at 2 am
            </h2>
            <div className="sticky">
              <QuizkartAlert />
            </div>
          </div>
          <div className="body">
            <ol className="timeline night-steps" aria-labelledby="night-h">
              {NIGHT.map((s) => (
                <li key={s.t} data-rv>
                  <strong>{s.t}</strong>
                  <p>{s.d}</p>
                  <span className="meta">{s.meta}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="frame">
          <div className="grid doc">
            <h2 id="labels-h">
              The three fix labels
            </h2>
            <div className="body">
              <ul className="labels" aria-labelledby="labels-h">
                <li data-rv>
                  <b>Recommended</b>
                  <span>
                    Passed every check. The only kind that can heal on its own, and only if your rule allows it. On the demo portal it must also be proved by
                    its own test.
                  </span>
                </li>
                <li data-rv>
                  <b>Use with care</b>
                  <span>
                    Probably right, but it has a concern, such as touching payments. The concern is written next to it. Shown, never approvable in one tap.
                  </span>
                </li>
                <li data-rv>
                  <b>Withheld</b>
                  <span>Failed a check. You get the cause and the reason, but no fix, because a wrong fix at 2 am is worse than none.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid doc">
            <h2 id="cmd-h">
              Things you can tell the bot
            </h2>
            <div className="body">
              <div className="table-wrap" data-rv>
                <table className="nums cmds stack" aria-labelledby="cmd-h">
                  <thead>
                    <tr>
                      <th scope="col">Send</th>
                      <th scope="col">What it does</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMMANDS.map(([c, d]) => (
                      <tr key={c}>
                        <td>
                          <code>{c}</code>
                        </td>
                        <td>{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid doc">
            <h2 id="cost-h">
              What it costs
            </h2>
            <div className="body prose">
              <p className="lead">
                Every Telegram account gets $5 of free AI credit.
              </p>
              <p>
                Deciding about an error costs about $0.0001, so noise costs almost nothing. Finding the cause and checking a fix costs about 1.3 cents,
                measured over our 20 test bugs, so $5 covers roughly 375 real problems.
              </p>
              <p className="soft">
                When the credit runs out, alerts and decisions continue with a daily limit; only new diagnoses stop. While we are a prototype each account
                has up to 3 apps, 5 diagnoses a day per app, and at most 3 fixes proposed per app per day.
              </p>
            </div>
          </div>

          <div className="grid doc">
            <h2 id="heal-h">
              Your heal rule
            </h2>
            <div className="body prose">
              <p className="lead">
                You approve every fix, or let it heal on its own under rules you set. Pick one with <code>/heal</code> on Telegram or when you connect:
              </p>
              <ul data-rv>
                <li>
                  <b>Ask</b> (the default): nothing goes in until you approve it.
                </li>
                <li>
                  <b>Heal after 10 minutes</b>: if a wake-up is not acknowledged in time (after the repeated calls), the fix goes in on its own. You choose the
                  minutes.
                </li>
                <li>
                  <b>Heal right away</b>: for the routes you name, or all of them.
                </li>
                <li>
                  <b>Off</b>: fixes arrive as diffs only.
                </li>
              </ul>
              <p>Rules that hold whatever you pick:</p>
              <ul className="soft" data-rv>
                <li>
                  Only <b>recommended</b> fixes heal on their own: all six code checks passed and every review vote agreed. A fix that adds an import, a
                  network call, a process, a file write or decodes hidden data never does.
                </li>
                <li>Never in login, sessions, tokens, admin and roles, payments, exams, grading, migrations, settings and config, CI or infrastructure files.</li>
                <li>
                  Only for errors your server sends with its secret (the bot gives you a server-only address). Errors that come with only the public key,
                  which web pages can see, are still alerted and explained, but never heal on their own.
                </li>
                <li>At most 2 heals per app a night, unless you change it (up to 5).</li>
                <li>
                  On your app a heal is a pull request. It merges by itself only if your branch requires status checks, and only once they pass; otherwise it
                  waits for you to merge and the wake-up calls go on. It needs write access you give for that one repository; that is set up with us by hand
                  for now. Without it you get the ready-to-apply diff.
                </li>
                <li>
                  After your deploy (a new release reporting in, or 10 minutes after the merge if you don&apos;t tag releases) it watches the error for 30
                  minutes. If it comes back at least 3 times and is not down by half, the fix is rolled back, you are woken again and self-healing stops for 12
                  hours.
                </li>
                <li>You get &ldquo;Healed while you were away&rdquo;: what broke, what changed, the proof, and one-tap Undo. Every step is in the logbook.</li>
              </ul>
              <p className="soft">
                On the demo portal, healing switches your session to the portal&apos;s fixed build and sends the failing request again to prove it works.
              </p>
            </div>
          </div>

          <div className="grid doc">
            <h2 id="never-h">
              What it never does
            </h2>
            <div className="body">
              <ul className="never" aria-labelledby="never-h">
                <li data-rv>
                  Deploy, restart servers or push straight to your main branch. A heal is always a pull request, and it merges by itself only behind your
                  required checks.
                </li>
                <li data-rv>Apply a fix you did not allow, a fix with open concerns, or a fix that failed its check.</li>
                <li data-rv>Keep your users&apos; emails, passwords or cookies.</li>
                <li data-rv>Let the AI overrule the rules for exams, payments or login.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section field-surface" aria-labelledby="try-h">
        <div className="frame grid doc">
          <h2 id="try-h">
            See it for yourself in a minute
          </h2>
          <div className="body">
            <ol className="timeline">
              <li data-rv>
                <strong>Break our demo exam portal</strong>
                <p>
                  In the <Link href="/#demo">live demo</Link> on the home page, pick a bug and press its button. You watch the same steps as above happen
                  live, with a timer.
                </p>
              </li>
              <li data-rv>
                <strong>Watch it heal, or approve it yourself</strong>
                <p>
                  On the demo, a recommended fix that its test proved heals on its own, and the portal works again. Turn &ldquo;Heal on its own&rdquo; off
                  to approve it yourself, and Undo puts the bug back.
                </p>
              </li>
              <li data-rv>
                <strong>Try your own error</strong>
                <p>
                  <Link href="/paste">Paste a stack trace</Link> from your own app and get the cause in plain words, without connecting anything.
                </p>
              </li>
              <li data-rv>
                <strong>Check our numbers</strong>
                <p>
                  The <Link href="/evidence">Evidence page</Link> shows how it did on 20 planted bugs and 30 real bugs from GitHub, and how each number was
                  measured.
                </p>
              </li>
            </ol>
            <div className="actions">
              <Link className="btn" href="/connect">
                Connect your app <span className="arrow">→</span>
              </Link>
              <Link className="textlink" href="/#demo">
                Try the live demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
