import { Diff } from "../ui/alert-card";
import { SUBMIT_DIFF } from "../ui/submit-fix";

/*
  "One night": the Submit bug on our demo exam portal, told as five moments. The times follow the
  speeds we measured there (a decision in about 2 s, a checked fix in about 12 s) and the default
  /heal auto 3m rule (the default). On wide screens with motion allowed, GSAP pins the section and scroll walks
  through the moments; otherwise it is a plain timeline with every scene shown.
*/
/* The lines the watcher read, numbered as in the file (sandbox/fixed.patch: lines 11-16). */
const SOURCE: Array<[number, string]> = [
  [11, '    code = data.get("code", "")'],
  [12, "    if not code.strip():"],
  [13, '        return {"ok": False, "error": "Write some code before submitting"}'],
  [14, '    language = data["language"]'],
  [15, "    runner = RUNNERS[language]"],
  [16, '    return {"ok": True, "runner": runner, "queued": True, "bytes": len(code)}'],
];

/* The changed lines of the real fix, under the file name: the whole patch is on /paste and in the alert. */
const FIX_LINES = [
  "+++ b/portal/submissions.py",
  ...SUBMIT_DIFF.split("\n").filter((l) => /^[-+] /.test(l)),
].join("\n");

/* Each scene is the product's own screen at that moment, at full size: the event it received, the alert on
   your phone, the code it read, the checked fix, and the message waiting when you wake. */
const STEPS: Array<{ t: string; ampm: string; title: string; text: React.ReactNode; scene: React.ReactNode }> = [
  {
    t: "02:07:00",
    ampm: "am",
    title: "A student presses Submit. The server crashes.",
    text: "Mid-exam, at night. The error reaches JaagteRaho the moment it happens, with personal data masked.",
    scene: (
      <div className="sc sc-screen sc-log" data-ui>
        <div className="sc-bar">
          <span>exam-portal · error received</span>
          <span className="sc-500">500</span>
        </div>
        <dl className="sc-fields">
          <dt>route</dt>
          <dd>POST /api/submit</dd>
          <dt>when</dt>
          <dd>02:07:00 · exam running</dd>
          <dt>kept</dt>
          <dd>error type, masked message, route, code lines</dd>
          <dt>dropped</dt>
          <dd>request body, headers, cookies, user details</dd>
        </dl>
        <pre>
          <span className="soft">File &quot;portal/submissions.py&quot;, line 14, in submit</span>
          {"\n"}
          {"    "}language = data[&quot;language&quot;]
          {"\n"}
          <span className="err">KeyError: &apos;language&apos;</span>
        </pre>
      </div>
    ),
  },
  {
    t: "02:07:02",
    ampm: "am",
    title: "It decides this is worth waking you.",
    text: "A critical flow is failing while an exam runs: a written rule says wake the owner. Telegram, a spoken alert, and a phone call if you turned calls on.",
    scene: (
      <div className="sc sc-screen sc-wake" data-ui>
        <div className="sc-callbar">
          <span className="call-dot" aria-hidden="true" />
          <span>
            <b>JaagteRaho</b> is calling
          </span>
          <span className="call-key">Press 1 to acknowledge</span>
        </div>
        <div className="tg">
          <div className="tg-chat">
            <div className="tg-msg">
              <p>
                <span className="wake-word">WAKE</span> · exam-portal · Submit code failing
              </p>
              <p>A critical flow is failing during an exam.</p>
              <p className="gap">
                <b>Your rule:</b> heal on its own if nobody acknowledges in 3 min
              </p>
              <span className="tg-time">02:07</span>
            </div>
            <div className="tg-keys">
              <span>Why?</span>
              <span>Acknowledge</span>
            </div>
          </div>
        </div>
        <span className="pill wake">
          <i /> Rule: critical flow, exam running
        </span>
      </div>
    ),
  },
  {
    t: "02:07:08",
    ampm: "am",
    title: "It finds the cause.",
    text: "Claude reads the failing file and what it calls, and says what broke in plain words, with the file and the line.",
    scene: (
      <div className="sc sc-screen sc-cause" data-ui>
        <div className="sc-bar">
          <span>portal/submissions.py</span>
          <span>read from the repository</span>
        </div>
        <pre className="sc-code">
          {SOURCE.map(([n, line]) => (
            <span key={n} className={n === 14 ? "hit" : n === 15 ? "near" : undefined}>
              <b>{n}</b>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
        <span className="sc-k">Cause, in plain words</span>
        <p>The Submit button never says which language the code is in, and the server insists on knowing it.</p>
        <code>portal/submissions.py · line 14</code>
      </div>
    ),
  },
  {
    t: "02:07:12",
    ampm: "am",
    title: "It writes a small fix, and checks it three ways.",
    text: "Code rules, a second AI reviewer, and a test it writes itself that must fail before the fix and pass after.",
    scene: (
      <div className="sc sc-screen sc-fix" data-ui>
        <Diff text={FIX_LINES} />
        <ul className="sc-verdicts">
          <li>
            <b>Code rules</b>
            <span>6 of 6 checks passed</span>
            <i aria-hidden="true">✓</i>
          </li>
          <li>
            <b>AI reviewer</b>
            <span>3 of 3 votes agree</span>
            <i aria-hidden="true">✓</i>
          </li>
          <li>
            <b>Its own test</b>
            <span>failed before, passes after</span>
            <i aria-hidden="true">✓</i>
          </li>
        </ul>
      </div>
    ),
  },
  {
    t: "02:10:12",
    ampm: "am",
    title: "You slept through it. Your rule lets it heal.",
    text: "No one picked up in 3 minutes, so the fix goes in. It watches the errors for 30 minutes, and Undo is one tap away.",
    scene: (
      <div className="sc sc-screen sc-healed" data-ui>
        <div className="sc-bar">
          <span>exam-portal · Telegram</span>
          <span className="sc-ok">healed 02:10</span>
        </div>
        <div className="tg">
          <div className="tg-chat">
            <div className="tg-msg">
              <p>
                <span className="ok-word">HEALED</span> · exam-portal · Submit code
              </p>
              <p>No one acknowledged in 3 min, so your rule applied the fix.</p>
              <p className="gap">Same request sent again: no crash.</p>
              <p>Watching the errors for 30 min. If they are not down by half, it is undone and you are woken.</p>
              <span className="tg-time">02:10</span>
            </div>
            <div className="tg-keys">
              <span>Undo</span>
              <span>Show fix</span>
            </div>
          </div>
        </div>
        <p className="sc-foot">
          Watching <code>/api/submit</code> until 02:40 · Undo stays one tap away
        </p>
      </div>
    ),
  },
];

export function NightStory() {
  return (
    <section className="section screen story4" aria-labelledby="night-h">
      <div className="frame">
        <div className="story-pin" data-story>
          <div className="story-top">
            <div>
              <p className="eyebrow" data-rv>
                One night
              </p>
              <h2 id="night-h" className="h-section" data-rv style={{ "--d": 1 } as React.CSSProperties}>
                From a crash to a checked fix, <em>in about twelve seconds.</em>
              </h2>
            </div>
            <p className="story-clock" aria-hidden="true">
              <span data-clock>{STEPS[0].t}</span>
              <small>am</small>
            </p>
          </div>
          <div className="story-track">
          <ol className="story-steps">
            {STEPS.map((s, i) => (
              <li key={s.t} className={i === 0 ? "on" : undefined} data-step={i} data-time={s.t} data-rv>
                <div className="st-text">
                  <time>
                    {s.t} {s.ampm}
                  </time>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
                <div className="st-scene" aria-hidden="true">
                  {s.scene}
                </div>
              </li>
            ))}
          </ol>
          <span className="story-bar" aria-hidden="true">
            <i data-bar />
          </span>
          </div>
          <p className="story-note small soft">One run on our demo exam portal, at the speeds we measured there. Your own rules decide the wake-up and the heal.</p>
        </div>
      </div>
    </section>
  );
}
