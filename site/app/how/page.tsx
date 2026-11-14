import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works, step by step · JaagteRaho",
  description: "What you see, how to connect your app in five minutes, and exactly what happens when it breaks at night.",
};

const SETUP = [
  {
    t: "Name your app",
    d: (
      <>
        On the <Link href="/connect">Connect page</Link>, type your app&apos;s name. Or open our Telegram bot and send{" "}
        <code className="mono">/new myapp</code>. You get a private address for your errors and <b>$5 of free AI credit</b>.
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
        A public repository: give its name. A private one: send <code className="mono">/github</code> and install our GitHub app.{" "}
        <b>Read-only</b>: we can read your code to find the cause, never change it. Without this you still get alerts and the likely cause, but
        no exact fix.
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
    d: "A Telegram card like the one on the right. If the decision was \"wake\", a spoken voice message follows so it can actually wake you. The same card updates itself as the next steps finish, so you get one message, not ten.",
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
    t: "You decide",
    d: "Tap \"Show fix\" to see the exact change. You apply it yourself and deploy, the way you always do. JaagteRaho never merges, deploys or writes to your code. Tap \"Diagnosis right\" or \"wrong\" so we learn how often it is right.",
    meta: "when you are ready",
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
  ["/pause and /resume", "Stop or restart all AI calls, fixes and wake-ups"],
];

export default function How() {
  return (
    <>
      <section className="section" style={{ borderTop: 0 }}>
        <p className="eyebrow">How it works, step by step</p>
        <h2>Connect once. Then your phone tells you when it matters.</h2>
        <div className="prose muted">
          <p>
            JaagteRaho is not a dashboard you keep open. You connect your app once, in about five minutes. After that it watches every error
            day and night, decides which ones deserve you, and tells you on Telegram what broke, why, and how to fix it.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="see-h">
        <h2 id="see-h">What you will see</h2>
        <ol className="steps three">
          <li>
            <b>Your phone · Telegram</b>
            <span>
              The main product. Alert cards with buttons, a voice message when it is serious, a summary every morning, and commands like{" "}
              <code className="mono">/status</code>.
            </span>
          </li>
          <li>
            <b>Your private fix page</b>
            <span>One page per problem: the cause, the exact code change, and what the safety check said. Opened from the alert.</span>
          </li>
          <li>
            <b>This website</b>
            <span>
              To sign up, to <Link href="/">try it on our demo app</Link>, to <Link href="/paste">paste an error</Link> you already have, and to
              see our <Link href="/evidence">test results</Link>.
            </span>
          </li>
        </ol>
      </section>

      <section className="section" aria-labelledby="setup-h">
        <h2 id="setup-h">Set it up · about 5 minutes, once</h2>
        <ol className="timeline">
          {SETUP.map((s, i) => (
            <li key={s.t}>
              <span className="num">{i + 1}</span>
              <div>
                <strong>{s.t}</strong>
                <p>{s.d}</p>
                {s.ways && (
                  <div className="ways">
                    <div>
                      <b>A · One command</b>
                      <code className="mono">npx jaagteraho init</code>
                      <span>
                        Run it in your project. It detects Django, Flask, FastAPI, Express, Next.js or plain Python/Node, shows every line it will
                        add before adding it, installs the free Sentry error library, and sends a test error. Telegram replies
                        &ldquo;connected&rdquo;.
                      </span>
                    </div>
                    <div>
                      <b>B · You already use Sentry</b>
                      <code className="mono">SENTRY_DSN=&lt;your JaagteRaho address&gt;</code>
                      <span>Change one setting. Your existing setup keeps working.</span>
                    </div>
                    <div>
                      <b>C · No code at all</b>
                      <code className="mono">Log drain → your logs address</code>
                      <span>Paste the address into Vercel, Heroku or Render. We find crash reports in your logs and drop everything else.</span>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="night-h">
        <h2 id="night-h">When your app breaks at 2 am</h2>
        <div className="night">
          <ol className="timeline">
            {NIGHT.map((s, i) => (
              <li key={s.t}>
                <span className="num">{i + 1}</span>
                <div>
                  <strong>{s.t}</strong>
                  <p>{s.d}</p>
                  <small className="mono">{s.meta}</small>
                </div>
              </li>
            ))}
          </ol>
          <figure className="tg" aria-label="Example Telegram alert">
            <figcaption className="eyebrow">Example alert on your phone</figcaption>
            <div className="tg-msg">
              <p>
                <b>🔴 WAKE</b> · quizkart · checkout failing
              </p>
              <p>23 failures in 9 min · 9 people affected in the last hour</p>
              <p>Rule 3: critical flow (checkout) failing repeatedly while you are away</p>
              <p>Claude: severity 4 outage (5/5), user blocked yes (5/5) · uncalibrated</p>
              <p>
                <b>Last change:</b> Began 38 min after commit 4f2a9c1 &ldquo;update cart total&rdquo; by riya, which changed cart/views.py (in the stack
                trace).
              </p>
              <p className="gap">
                <b>Cause:</b> The cart total is now a string, so adding the delivery fee to it crashes the checkout.
              </p>
              <p>
                <code className="mono">cart/views.py:48</code> · likely
              </p>
              <p>
                <b>Fix:</b> 2 lines · all checks passed · AI-written
              </p>
            </div>
            <div className="tg-btns">
              <span>Why?</span>
              <span>Show fix</span>
              <span>Acknowledge</span>
              <span>Diagnosis right</span>
              <span>Diagnosis wrong</span>
            </div>
            <p className="muted small">The card arrives first with &ldquo;working on it&hellip;&rdquo; and fills in as the cause and fix are ready.</p>
          </figure>
        </div>
      </section>

      <section className="section" aria-labelledby="labels-h">
        <h2 id="labels-h">The three fix labels</h2>
        <ol className="steps three">
          <li>
            <b className="ok">Recommended</b>
            <span>Passed every check. On our demo app you can approve it from Telegram and a pull request opens; you still merge it.</span>
          </li>
          <li>
            <b>Use with care</b>
            <span>Probably right, but it has a concern, such as touching payments. The concern is written next to it. Shown, never approvable in one tap.</span>
          </li>
          <li>
            <b className="bad">Withheld</b>
            <span>Failed a check. You get the cause and the reason, but no fix, because a wrong fix at 2 am is worse than none.</span>
          </li>
        </ol>
      </section>

      <section className="section" aria-labelledby="cmd-h">
        <h2 id="cmd-h">Things you can tell the bot</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="nums">
            <thead>
              <tr>
                <th>Send</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map(([c, d]) => (
                <tr key={c}>
                  <td className="mono">{c}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="cost-h">
        <h2 id="cost-h">What it costs</h2>
        <div className="prose muted">
          <p>
            <b>Every Telegram account gets $5 of free AI credit.</b> Deciding about an error costs about $0.0001, so noise costs almost nothing.
            Finding the cause and checking a fix costs about 1.3 cents, measured over our 20 test bugs, so $5 covers roughly 375 real problems.
          </p>
          <p>
            When the credit runs out, alerts and decisions continue with a daily limit; only new diagnoses stop. While we are a prototype each
            account has up to 3 apps, 5 diagnoses a day per app, and at most 3 fixes proposed per app per day.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="never-h">
        <h2 id="never-h">What it never does</h2>
        <ul className="prose muted">
          <li>Merge, deploy or write to your code. Code access is read-only.</li>
          <li>Approve a fix on its own, or show a fix that failed its check.</li>
          <li>Keep your users&apos; emails, passwords or cookies.</li>
          <li>Let the AI overrule the rules for exams, payments or login.</li>
        </ul>
      </section>

      <section className="section" aria-labelledby="try-h">
        <h2 id="try-h">See it for yourself in a minute</h2>
        <ol className="timeline">
          <li>
            <span className="num">1</span>
            <div>
              <strong>Break our demo exam portal</strong>
              <p>
                On the <Link href="/">home page</Link>, pick a bug and press the button. You watch the same steps as above happen live, with a timer.
              </p>
            </div>
          </li>
          <li>
            <span className="num">2</span>
            <div>
              <strong>Approve the fix</strong>
              <p>On the demo, a recommended fix can be approved. The portal works again and the page says so.</p>
            </div>
          </li>
          <li>
            <span className="num">3</span>
            <div>
              <strong>Try your own error</strong>
              <p>
                <Link href="/paste">Paste a stack trace</Link> from your own app and get the cause in plain words, without connecting anything.
              </p>
            </div>
          </li>
          <li>
            <span className="num">4</span>
            <div>
              <strong>Check our numbers</strong>
              <p>
                The <Link href="/evidence">Evidence page</Link> shows how it did on 20 planted bugs and 30 real bugs from GitHub, including where it
                is weak.
              </p>
            </div>
          </li>
        </ol>
        <div className="actions">
          <Link className="btn" href="/connect">
            Connect your app
          </Link>
          <Link className="btn ghost" href="/">
            Break the demo
          </Link>
        </div>
      </section>
    </>
  );
}
