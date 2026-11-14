/*
  "One night": the Submit bug on our demo exam portal, told as five moments. The times follow the
  speeds we measured there (a decision in about 2 s, a checked fix in about 12 s) and the default
  /heal auto 10m rule. On wide screens with motion allowed, GSAP pins the section and scroll walks
  through the moments; otherwise it is a plain timeline with every scene shown.
*/
const STEPS: Array<{ t: string; ampm: string; title: string; text: React.ReactNode; scene: React.ReactNode }> = [
  {
    t: "02:07:00",
    ampm: "am",
    title: "A student presses Submit. The server crashes.",
    text: "Mid-exam, at night. The error reaches JaagteRaho the moment it happens, with personal data masked.",
    scene: (
      <div className="sc sc-log">
        <div className="sc-bar">
          <span>exam-portal · server</span>
          <span className="sc-500">500</span>
        </div>
        <pre>
          <span className="soft">POST /api/submit</span>
          {"\n"}
          <span className="soft">File &quot;portal/submissions.py&quot;, line 14</span>
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
      <div className="sc sc-call">
        <span className="call-ring" aria-hidden="true" />
        <span className="call-who">JaagteRaho</span>
        <span className="call-what">Exam portal: Submit is failing during a live exam</span>
        <span className="call-key">Press 1 to acknowledge</span>
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
      <div className="sc sc-cause">
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
      <div className="sc sc-fix">
        <pre className="diff">
          <span className="h">portal/submissions.py{"\n"}</span>
          <span className="d">-    language = data[&quot;language&quot;]{"\n"}</span>
          <span className="a">+    language = data.get(&quot;language&quot;){"\n"}</span>
          <span className="a">+    runner = RUNNERS.get(language){"\n"}</span>
          <span className="a">+    if runner is None: return a clear message{"\n"}</span>
        </pre>
        <span className="sc-checks">
          <span>✓ Code rules</span>
          <span>✓ Reviewer agreed</span>
          <span>✓ Its own test</span>
        </span>
      </div>
    ),
  },
  {
    t: "02:17:12",
    ampm: "am",
    title: "You slept through it. Your rule lets it heal.",
    text: "No one acknowledged in 10 minutes, so the fix goes in. It watches the errors for 30 minutes, and Undo is one tap away.",
    scene: (
      <div className="sc sc-healed">
        <span className="stamp ok">Healed</span>
        <p>Same request sent again: no crash.</p>
        <span className="sc-row">
          <span className="soft">Watching for 30 min · errors down</span>
          <span className="fake-btn">Undo</span>
        </span>
      </div>
    ),
  },
];

export function NightStory() {
  return (
    <section className="section screen story4" id="night" aria-labelledby="night-h">
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
          <p className="story-note small soft">One run on our demo exam portal, at the speeds we measured there. Your own rules decide the wake-up and the heal.</p>
        </div>
      </div>
    </section>
  );
}
