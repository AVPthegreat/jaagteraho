"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  The hero: a sleeping city, and a faithful replay of one real run on our demo exam portal
  (the Submit code bug: its real error, decision, cause and fix). The steps arrive at the measured
  median times from the demo portal, played in real time; the 10-minute wait for the owner is skipped.
  With reduced motion the finished run is shown at once and nothing loops.
*/

// When each step appears, in ms after the replay starts (error at 0.4 s, so +1.6 s, +6.0 s, +9.5 s).
const AT = [400, 2000, 2700, 6400, 9900, 12600, 13600];
const LOOP_MS = 21000;

// The owner's elapsed clock for each moment, in seconds (the heal happens after the 10-minute rule).
function clock(ms: number, phase: number) {
  if (phase >= 5) return phase >= 6 ? 612.4 : 610.0;
  return Math.max(0, (ms - AT[0]) / 1000);
}
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/* A deterministic skyline: the same buildings and windows on the server and in the browser. */
type Win = { x: number; y: number; lit: number };
const BUILDINGS: Array<{ x: number; w: number; h: number; wins: Win[] }> = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const out: Array<{ x: number; w: number; h: number; wins: Win[] }> = [];
  let x = -10;
  while (x < 1460) {
    const w = 46 + Math.floor(rnd() * 70);
    const h = 60 + Math.floor(rnd() * 150);
    const wins: Win[] = [];
    for (let wy = 220 - h + 14; wy < 206; wy += 15) {
      for (let wx = x + 8; wx < x + w - 10; wx += 12) {
        const r = rnd();
        wins.push({ x: wx, y: wy, lit: r > 0.955 ? 2 : r > 0.9 ? 1 : 0 });
      }
    }
    out.push({ x, w, h, wins });
    x += w + 3 + Math.floor(rnd() * 6);
  }
  return out;
})();
// The owner's window: a fixed spot in a mid-height building right of centre.
const OWNER = (() => {
  const b = BUILDINGS.find((b) => b.x > 980 && b.h > 110) ?? BUILDINGS[BUILDINGS.length - 3];
  return { x: b.x + 8 + 12, y: 220 - b.h + 14 + 15 };
})();

function Skyline() {
  return (
    <svg className="skyline" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sky-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1524" />
          <stop offset="1" stopColor="#090c14" />
        </linearGradient>
        <radialGradient id="sky-glow">
          <stop offset="0" stopColor="#ffcf6e" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffcf6e" stopOpacity="0" />
        </radialGradient>
      </defs>
      {BUILDINGS.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={220 - b.h} width={b.w} height={b.h} fill="url(#sky-b)" />
          {b.wins.map((w, j) =>
            w.lit ? <rect key={j} x={w.x} y={w.y} width="5" height="7" fill={w.lit === 2 ? "#f5c46a" : "#8a7a58"} opacity={w.lit === 2 ? 0.55 : 0.35} /> : null,
          )}
        </g>
      ))}
      <circle className="sky-owner-glow" cx={OWNER.x + 2.5} cy={OWNER.y + 3.5} r="26" fill="url(#sky-glow)" />
      <rect className="sky-owner" x={OWNER.x} y={OWNER.y} width="5" height="7" />
    </svg>
  );
}

export function HeroStage({ children }: { children: React.ReactNode }) {
  const [ms, setMs] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const root = useRef<HTMLElement | null>(null);
  const t0 = useRef<number | null>(null);
  const acc = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    if (root.current) io.observe(root.current);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mq.removeEventListener("change", set);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const running = !reduced && !paused && visible;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    t0.current = performance.now() - acc.current;
    const tick = (now: number) => {
      acc.current = (now - (t0.current ?? now)) % LOOP_MS;
      setMs(acc.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const replay = useCallback(() => {
    acc.current = 0;
    setMs(0);
    setPaused(false);
  }, []);

  const shown = reduced ? LOOP_MS - 1 : ms;
  let phase = -1;
  AT.forEach((t, i) => {
    if (shown >= t) phase = i;
  });
  const fading = !reduced && ms > LOOP_MS - 700;

  return (
    <section className="hero" ref={root} data-waking={phase >= 1 && phase < 5 ? "" : undefined} aria-labelledby="hero-h">
      <div className="hero-sky" aria-hidden="true">
        <div className="stars" />
      </div>
      <Skyline />
      <div className="frame hero-grid">
        <div className="hero-copy">{children}</div>
        <figure className="replay-wrap" aria-labelledby="replay-cap">
          <Replay phase={phase} elapsed={clock(shown, phase)} fading={fading} />
          <p className="sr-only">
            Replay of a run: a KeyError on the exam portal&apos;s Submit code page arrives; 1.6 seconds later rule 2 (a critical flow failing during
            an exam) wakes the owner with a voice note; at 6 seconds Claude names the cause, portal/submissions.py line 14; at 9.5 seconds a 4-line fix
            has passed six code checks, a review and its own test. Nobody acknowledges for 10 minutes, so under the owner&apos;s rule the fix heals the
            portal on its own, the same request is sent again without a crash, and the owner can undo it.
          </p>
          <figcaption id="replay-cap" className="replay-cap">
            <span>
              <b>Example:</b> one run on our demo exam portal, replayed with its real error, cause and fix, at the median times we measured there.
              The 10-minute wait is skipped.
            </span>
            {!reduced && (
              <span className="replay-ctl">
                <button type="button" className="chip-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                  {paused ? "Play" : "Pause"}
                </button>
                <button type="button" className="chip-btn" onClick={replay}>
                  Replay
                </button>
              </span>
            )}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

const CHECKS = ["6 of 6 code checks", "Review agreed", "Proved by a test"];
const WAVE = [6, 11, 16, 9, 14, 18, 8, 12, 17, 10, 6, 13, 9, 5];

function Replay({ phase, elapsed, fading }: { phase: number; elapsed: number; fading: boolean }) {
  const on = (i: number) => (phase >= i ? "on" : undefined);
  const status =
    phase < 1
      ? { text: "Owner asleep", cls: "calm" }
      : phase < 5
        ? { text: "Waking the owner", cls: "wake" }
        : phase < 6
          ? { text: "No answer in 10 min", cls: "care" }
          : { text: "Healed · owner still asleep", cls: "ok" };

  return (
    <div className="replay" data-ui data-fading={fading || undefined} aria-hidden="true">
      <div className="replay-bar">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="replay-title">exam-portal · the owner&apos;s logbook</span>
        <span className="replay-badge">Example · replayed</span>
      </div>
      <div className="replay-status">
        <span className="replay-clock">
          02:14 <small>am</small>
        </span>
        <span className={`pill ${status.cls}`}>
          <i />
          {status.text}
        </span>
        <span className="replay-timer">{fmt(elapsed)}</span>
      </div>
      <ol className="replay-steps">
        <li className={on(0)}>
          <time>00:00.0</time>
          <div>
            <b>Error received</b>
            <code>KeyError: &apos;language&apos; · POST /api/submit</code>
          </div>
        </li>
        <li className={on(1)}>
          <time>00:01.6</time>
          <div className="row">
            <span className="stamp wake">Woke owner</span>
            <span>
              <b>Rule 2:</b> a critical flow failing during an exam
            </span>
          </div>
        </li>
        <li className={on(2)}>
          <time>00:02.3</time>
          <div className="row">
            <span className="wave" data-live={phase >= 2 && phase < 5 ? "" : undefined}>
              {WAVE.map((h, i) => (
                <i key={i} style={{ "--i": i, height: h } as React.CSSProperties} />
              ))}
            </span>
            <span>Voice wake-up sent to the owner&apos;s phone, again until acknowledged</span>
          </div>
        </li>
        <li className={on(3)}>
          <time>00:06.0</time>
          <div>
            <b>Cause, in plain words</b>
            <span>The Submit button never says which language the code is in, and the server insists on knowing it.</span>
            <code className="loc">portal/submissions.py · line 14 · likely</code>
          </div>
        </li>
        <li className={on(4)}>
          <time>00:09.5</time>
          <div>
            <b>Fix written and checked</b>
            <pre className="mini-diff">
              <span className="d">-    language = data[&quot;language&quot;]</span>
              <span className="d">-    runner = RUNNERS[language]</span>
              <span className="a">+    language = data.get(&quot;language&quot;)</span>
              <span className="a">+    runner = RUNNERS.get(language)</span>
              <span className="a">+    if runner is None: return a clear message</span>
            </pre>
            <span className="checks">
              {CHECKS.map((c, i) => (
                <span key={c} className={i ? "strong" : undefined} style={{ "--i": i } as React.CSSProperties}>
                  {c}
                </span>
              ))}
            </span>
          </div>
        </li>
        <li className={`ff ${on(5) ?? ""}`}>
          <time>+10 min</time>
          <div>
            <span>No one acknowledged. Your rule: heal on its own after 10 minutes.</span>
          </div>
        </li>
        <li className={on(6)}>
          <time>10:12.4</time>
          <div>
            <span className="row">
              <span className="stamp ok">Healed</span>
              <b>Same request sent again: no crash</b>
              <span className="undo">Undo</span>
            </span>
            <span className="soft">The student now sees &ldquo;Choose a supported language (python, cpp or java) before submitting&rdquo;.</span>
          </div>
        </li>
      </ol>
    </div>
  );
}

