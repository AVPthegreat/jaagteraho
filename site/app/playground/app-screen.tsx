"use client";

import type { ReactNode } from "react";

/*
  A small, believable screen for each playground app, around its one real action. The screen itself is a
  sample (it says so); the button sends the real request to the visitor's copy, and the red / green
  states show the real error and the real answer.
*/

export type Look = "idle" | "bad" | "good" | "ready";

type Props = {
  app: string;
  title: string;
  action: string;
  busy: boolean;
  disabled: boolean;
  onUse: () => void;
  look: Look;
  errorLine: string;
  okLine: string;
  hint: string;
  details?: ReactNode;
  /** The app's real answer after the fix, to tell "worked" from "now refuses cleanly". */
  response?: unknown;
};

/** A fixed app either does the thing, or now refuses bad input with a clear message instead of a 500. */
function verdict(resp: unknown, okLine: string): { title: string; line: string } {
  if (typeof resp === "object" && resp !== null && !Array.isArray(resp)) {
    const r = resp as Record<string, unknown>;
    const status = typeof r.status === "number" ? r.status : null;
    const err = typeof r.error === "string" ? r.error : typeof r.detail === "string" && status !== null && status >= 400 ? r.detail : null;
    if (err || (status !== null && status >= 400) || r.ok === false) {
      return { title: "No more crash ✓", line: err ? `The app now answers clearly: “${err.slice(0, 120)}”` : "The app now answers with a clear message instead of a 500." };
    }
  }
  return { title: "It worked ✓", line: okLine };
}

function Screen({ app }: { app: string }) {
  switch (app) {
    case "campuskart":
      return (
        <div className="as-listing">
          <span className="as-img" aria-hidden="true" />
          <div>
            <b>Scientific calculator</b>
            <span className="as-muted">Used · Hostel B · posted 2 h ago</span>
            <span className="as-price">₹450</span>
          </div>
        </div>
      );
    case "clinicq":
      return (
        <div className="as-queue">
          <div className="as-now">
            <span className="as-muted">Now serving</span>
            <b>A-12</b>
          </div>
          <ul>
            <li>
              A-13 <span className="as-muted">waiting · ~6 min</span>
            </li>
            <li>
              A-14 <span className="as-muted">waiting · ~12 min</span>
            </li>
          </ul>
        </div>
      );
    case "examhall":
      return (
        <div className="as-exam">
          <div className="as-row">
            <b>Data Structures · Quiz 3</b>
            <span className="as-timer">24:59</span>
          </div>
          <span className="as-muted">Question 1 of 10</span>
          <ul className="as-options">
            <li>O(n)</li>
            <li className="on">O(log n)</li>
            <li>O(n log n)</li>
          </ul>
        </div>
      );
    case "fleetwise":
      return (
        <ul className="as-routes">
          <li>
            <b>Route 7</b> <span className="as-muted">Campus → Station</span> <span className="as-chip">08:15</span>
          </li>
          <li>
            <b>Route 12</b> <span className="as-muted">Depot → City Centre</span> <span className="as-chip">08:40</span>
          </li>
          <li>
            <b>Route 3</b> <span className="as-muted">Airport → Depot</span> <span className="as-chip late">delayed</span>
          </li>
        </ul>
      );
    case "ledgerly":
      return (
        <div className="as-invoice">
          <div className="as-row">
            <span className="as-muted">Item</span>
            <span>Website design</span>
          </div>
          <div className="as-row">
            <span className="as-muted">Amount</span>
            <span>₹10,000.00</span>
          </div>
          <div className="as-row">
            <span className="as-muted">GST 18%</span>
            <span>₹1,800.00</span>
          </div>
          <div className="as-row total">
            <span>Total</span>
            <b>₹11,800.00</b>
          </div>
        </div>
      );
    case "messmenu":
      return (
        <ul className="as-meals">
          <li>
            <b>Breakfast</b> <span className="as-muted">Poha, tea · 7:30</span>
          </li>
          <li className="on">
            <b>Lunch</b> <span className="as-muted">Rajma chawal · 12:30</span>
          </li>
          <li>
            <b>Dinner</b> <span className="as-muted">Roti, dal, sabzi · 8:00</span>
          </li>
        </ul>
      );
    case "tiffinbox":
      return (
        <div className="as-order">
          <div className="as-row">
            <b>Veg thali × 2</b>
            <span>₹180</span>
          </div>
          <span className="as-muted">Annapurna Kitchen · rider on the way</span>
          <span className="as-track" aria-hidden="true">
            <i />
          </span>
        </div>
      );
    default:
      return (
        <div className="as-generic" aria-hidden="true">
          <span />
          <span className="short" />
        </div>
      );
  }
}

export function AppScreen({ app, title, action, busy, disabled, onUse, look, errorLine, okLine, hint, details, response }: Props) {
  const ok = verdict(response, okLine);
  return (
    <div className={`as as-${app}`}>
      <p className="as-name">{title}</p>
      <div className="as-screen">
        <Screen app={app} />
      </div>
      <div className={`as-act ${look}`} key={look}>
        <button type="button" className="btn as-btn" onClick={onUse} disabled={disabled}>
          {busy ? "Sending…" : action}
        </button>
        {look === "bad" ? (
          <p className="as-status bad" role="status">
            <b>500 · Something went wrong</b>
            <span className="mono">{errorLine}</span>
          </p>
        ) : look === "good" ? (
          <p className="as-status good" role="status">
            <b>{ok.title}</b>
            <span>{ok.line}</span>
          </p>
        ) : look === "ready" ? (
          <p className="as-status good soft-ok">
            <b>The fix is in</b>
            <span>Press the button to try it.</span>
          </p>
        ) : (
          <p className="as-status">
            <span className="as-muted">{hint}</span>
          </p>
        )}
      </div>
      {details}
      <p className="as-note">Sample screen · the button sends a real request to your copy</p>
    </div>
  );
}
