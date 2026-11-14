"use client";

import { useRef, useState } from "react";
import { GATE_SRC, HEAL_SRC } from "../site";

/*
  "How safe is it": five layers a fix passes through, drawn as nested shields around your app.
  Pick a layer (hover, focus or tap) and its ring lights up, and the layer's own output shows beside the shield,
  for the demo portal's Submit fix. Facts come from gate.ts (the six checks, 3 review votes), verify.ts and heal.ts.
*/
const Tick = () => <i aria-hidden="true">✓</i>;

const LAYERS: Array<{ name: string; short: string; text: React.ReactNode; out: React.ReactNode }> = [
  {
    name: "Code rules",
    short: "Hard checks, no AI",
    text: (
      <>
        Six checks done by code: the edit applies cleanly, stays small, stays out of protected areas, adds no packages, imports, network calls or file
        writes, and leaves valid code. Fail one and the fix is not shown at all.
      </>
    ),
    out: (
      <>
        <p className="so-head">
          <span>Submit fix · code checks</span>
          <b>6 of 6</b>
        </p>
        <ul className="so-checks">
          <li>
            <Tick /> Applies cleanly
          </li>
          <li>
            <Tick /> Small: 1 file, 4 lines
          </li>
          <li>
            <Tick /> No protected area
          </li>
          <li>
            <Tick /> No new import
          </li>
          <li>
            <Tick /> No new web address
          </li>
          <li>
            <Tick /> Still valid Python
          </li>
        </ul>
      </>
    ),
  },
  {
    name: "AI reviewer",
    short: "A second opinion",
    text: <>A separate Claude review grades the diff: does it remove the cause, does it touch anything sensitive, could it break something else. Every vote must agree before a fix may heal on its own.</>,
    out: (
      <>
        <p className="so-head">
          <span>Submit fix · review</span>
          <b>3 votes</b>
        </p>
        <dl className="so-rows">
          <dt>Removes the cause</dt>
          <dd>3 of 3</dd>
          <dt>Touches something sensitive</dt>
          <dd>no</dd>
          <dt>Could break something else</dt>
          <dd>no</dd>
        </dl>
        <p className="so-foot">
          <Tick /> Every vote agrees
        </p>
      </>
    ),
  },
  {
    name: "Its own test",
    short: "Fails before, passes after",
    text: (
      <>
        Where it can run the code safely, as on our own live apps, it writes a regression test that must fail on the old code and pass on the fixed code,
        in a throwaway copy with no network or secrets.
      </>
    ),
    out: (
      <>
        <p className="so-head">
          <span>Regression test · throwaway copy</span>
          <b>proved</b>
        </p>
        <dl className="so-rows">
          <dt>Old code</dt>
          <dd className="bad">fails · KeyError: &apos;language&apos;</dd>
          <dt>Fixed code</dt>
          <dd className="good">passes</dd>
        </dl>
        <p className="so-foot">No network, no secrets, deleted after the run</p>
      </>
    ),
  },
  {
    name: "Your rules",
    short: "You decide how far it goes",
    text: (
      <>
        Small bugs: fixed on their own, you get a note in the morning. Big ones: it calls you; no answer in 3 minutes, it heals. <code>/heal minor off</code> and{" "}
        <code>/heal ask</code> make you approve them. At most 5 small and 2 big a night, never in login, payments, exams or settings, and only behind your
        branch&rsquo;s own required checks.
      </>
    ),
    out: (
      <div className="tg">
        <div className="tg-chat">
          <span className="tg-reply">/heal auto 3m</span>
          <div className="tg-msg">
            <p>Big bugs: it calls you; no answer in 3 minutes, it heals.</p>
            <p>Small ones are fixed on their own with a quiet note.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    name: "Undo",
    short: "Rolled back if it does not help",
    text: <>After a heal it watches for 30 minutes. If errors are not down by half, it reverts, wakes you and pauses healing for 12 hours. Every heal has one-tap Undo.</>,
    out: (
      <>
        <p className="so-head">
          <span>exam-portal · after the heal</span>
          <b>watching</b>
        </p>
        <dl className="so-rows">
          <dt>Healed</dt>
          <dd>02:10</dd>
          <dt>Watching until</dt>
          <dd>02:40</dd>
          <dt>Errors not down by half</dt>
          <dd>undone, you are woken</dd>
        </dl>
        <span className="so-undo">Undo</span>
      </>
    ),
  },
];

// Nested shield outlines, outermost first. One path, scaled about the centre.
const SHIELD = "M200 24 L340 78 V196 C340 290 278 350 200 378 C122 350 60 290 60 196 V78 Z";

export function Shield() {
  const [on, setOn] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={box} className="shield" data-shield data-draw>
      <figure className="shield-art" aria-hidden="true">
        <svg viewBox="0 0 400 400" focusable="false">
          {LAYERS.map((l, i) => {
            const s = 1 - i * 0.15;
            return (
              <path
                key={l.name}
                className={`sh-ring${i === on ? " on" : ""}${i < on ? " past" : ""}`}
                d={SHIELD}
                pathLength={1}
                transform={`translate(${200 - 200 * s} ${200 - 200 * s}) scale(${s})`}
                style={{ strokeWidth: 2 / s, "--i": i } as React.CSSProperties}
              />
            );
          })}
          <text x="200" y="214" textAnchor="middle" className="sh-core">
            your app
          </text>
        </svg>
      </figure>
      <ol className="shield-list">
        {LAYERS.map((l, i) => (
          <li key={l.name} data-rv style={{ "--d": i } as React.CSSProperties}>
            <button type="button" aria-expanded={i === on} aria-controls={`sh-${i}`} onClick={() => setOn(i)}>
              <span className="sl-n">{i + 1}</span>
              <span className="sl-name">{l.name}</span>
              <span className="sl-short">{l.short}</span>
            </button>
            <p id={`sh-${i}`} hidden={i !== on}>
              {l.text}
            </p>
            {/* Under the open layer on phones and tablets (hidden on wide screens, where the copy beside the shield shows). */}
            <div className="shield-out in-list" data-ui hidden={i !== on}>
              {l.out}
            </div>
          </li>
        ))}
      </ol>
      {/* Wide screens: the five outputs share one cell over the foot of the shield and cross-fade, so nothing
          appears, resizes or re-anchors as the page scrolls through the layers. */}
      <div className="shield-outs" aria-hidden="true">
        {LAYERS.map((l, i) => (
          <div key={l.name} className={`shield-out${i === on ? " on" : ""}`} data-ui inert>
            {l.out}
          </div>
        ))}
      </div>
      <p className="shield-src small soft">
        The rules are code you can read: <a href={GATE_SRC}>gate.ts</a> and <a href={HEAL_SRC}>heal.ts</a>.
      </p>
    </div>
  );
}
