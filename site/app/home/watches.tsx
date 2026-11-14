"use client";

import { useRef, useState } from "react";
import { useScrollStep } from "./use-step";
import { Icon } from "../ui/icons";

/*
  "What it watches": four places where a night-time error hurts. Each card is a tab; the panel says
  what JaagteRaho does when that part breaks, and which written rule (decide.ts) makes the call.
*/
type Kind = "wake" | "notify" | "calm";
const CASES: Array<{
  id: string;
  title: string;
  icon: string;
  sub: string;
  error: string;
  does: Array<[Kind, string]>;
  why: string;
  heal: string;
}> = [
  {
    id: "exam",
    title: "Exam portal",
    icon: "clock",
    sub: "Submit, start, timer",
    error: "KeyError: 'language' on POST /api/submit",
    does: [
      ["wake", "Wake you during an exam"],
      ["notify", "Message you otherwise"],
    ],
    why: "You mark exam pages as critical and send /exam 2h when one is running. A critical flow failing during an exam always wakes you. No AI answer can lower that.",
    heal: "Grading and exam logic are protected code: a fix there waits for your Approve.",
  },
  {
    id: "pay",
    title: "Payments",
    icon: "card",
    sub: "Checkout, fees, refunds",
    error: "ZeroDivisionError in the fee maths (no coupon)",
    does: [
      ["notify", "Message you at once"],
      ["wake", "Wake you if it fails 3 times in 10 minutes"],
    ],
    why: "Payments are a critical flow. One failure is a message; a burst while you are away is worth waking for.",
    heal: "Payment code is protected: it is never healed on its own. You get the cause and the fix to approve.",
  },
  {
    id: "login",
    title: "Login",
    icon: "lock",
    sub: "Sign-in, sessions, tokens",
    error: "TypeError on sign-in: user is undefined",
    does: [
      ["wake", "Wake you if it is an outage"],
      ["notify", "Never quiet once 5 people hit it"],
    ],
    why: "When people cannot get in, Claude rates it as blocking or an outage. Once 5 different people hit the same error in an hour, it is at least a message.",
    heal: "Login, sessions and roles are protected code: the fix waits for you.",
  },
  {
    id: "api",
    title: "APIs and pages",
    icon: "plug",
    sub: "Everything else",
    error: "AttributeError: 'NoneType' has no attribute 'title'",
    does: [
      ["notify", "Message you if it blocks users"],
      ["calm", "The 08:00 summary if it is minor"],
      ["calm", "Ignore bot scanners and noise"],
    ],
    why: "Most errors are not worth a night. It reads severity five times, then the written rules pick one of four actions. Harmless noise is ignored.",
    heal: "This is where healing helps most: a small checked fix can go in under your heal rule.",
  },
];

export function Watches() {
  const [on, setOn] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  useScrollStep(box, setOn);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const c = CASES[on];

  const onKey = (e: React.KeyboardEvent) => {
    const n = CASES.length;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (on + 1) % n;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (on - 1 + n) % n;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setOn(next);
    tabs.current[next]?.focus();
  };

  return (
    <div ref={box} className="watch">
      <div className="watch-cards" role="tablist" aria-label="Parts of your app" onKeyDown={onKey}>
        {CASES.map((w, i) => (
          <button
            key={w.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`wt-${w.id}`}
            aria-selected={i === on}
            aria-controls="wt-panel"
            tabIndex={i === on ? 0 : -1}
            className="watch-card"
            onClick={() => setOn(i)}
            data-rv
            style={{ "--d": i } as React.CSSProperties}
          >
            <span className="wc-icon">
              <Icon name={w.icon} size={22} />
            </span>
            <span className="wc-title">{w.title}</span>
            <span className="wc-sub">{w.sub}</span>
            <svg className="wc-pulse" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path d="M0 22H70L78 22L84 8L92 34L98 22H200" pathLength={1} />
            </svg>
          </button>
        ))}
      </div>
      <div className="watch-panel" role="tabpanel" id="wt-panel" aria-labelledby={`wt-${c.id}`} key={c.id}>
        <div className="wp-err">
          <span className="wp-k">When this fails</span>
          <code>{c.error}</code>
        </div>
        <div className="wp-do">
          <span className="wp-k">JaagteRaho will</span>
          <span className="wp-pills">
            {c.does.map(([k, t]) => (
              <span key={t} className={`pill ${k}`}>
                <i />
                {t}
              </span>
            ))}
          </span>
        </div>
        <p className="wp-why">{c.why}</p>
        <p className="wp-heal">
          <Icon name="shield" size={18} />
          <span>{c.heal}</span>
        </p>
      </div>
    </div>
  );
}
