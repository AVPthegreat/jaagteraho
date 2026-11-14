"use client";

import { useRef, useState } from "react";
import { useScrollStep } from "./use-step";
import { GATE_SRC, HEAL_SRC } from "../site";

/*
  "How safe is it": five layers a fix passes through, drawn as nested shields around your app.
  Pick a layer (hover, focus or tap) and its ring lights up. Facts come from gate.ts, verify.ts and heal.ts.
*/
const LAYERS: Array<{ name: string; short: string; text: React.ReactNode }> = [
  {
    name: "Code rules",
    short: "Hard checks, no AI",
    text: (
      <>
        Six checks done by code: the edit applies cleanly, stays small, stays out of protected areas, adds no packages, imports, network calls or file
        writes, and leaves valid code. Fail one and the fix is not shown at all.
      </>
    ),
  },
  {
    name: "AI reviewer",
    short: "A second opinion",
    text: <>A separate Claude review grades the diff: does it remove the cause, does it touch anything sensitive, could it break something else. Every vote must agree before a fix may heal on its own.</>,
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
  },
  {
    name: "Your rules",
    short: "You decide how far it goes",
    text: (
      <>
        <code>/heal ask</code> waits for your Approve (the default). <code>/heal auto 10m</code> heals if you sleep through a wake-up. At most 2 heals per
        app a night, never in login, payments, exams or settings, and only behind your branch&apos;s own required checks.
      </>
    ),
  },
  {
    name: "Undo",
    short: "Rolled back if it does not help",
    text: <>After a heal it watches for 30 minutes. If errors are not down by half, it reverts, wakes you and pauses healing for 12 hours. Every heal has one-tap Undo.</>,
  },
];

// Nested shield outlines, outermost first. One path, scaled about the centre.
const SHIELD = "M200 24 L340 78 V196 C340 290 278 350 200 378 C122 350 60 290 60 196 V78 Z";

export function Shield() {
  const [on, setOn] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  useScrollStep(box, setOn);
  return (
    <div ref={box} className="shield" data-shield>
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
                style={{ strokeWidth: 2 / s }}
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
          </li>
        ))}
      </ol>
      <p className="shield-src small soft">
        The rules are code you can read: <a href={GATE_SRC}>gate.ts</a> and <a href={HEAL_SRC}>heal.ts</a>.
      </p>
    </div>
  );
}
