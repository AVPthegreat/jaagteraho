"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ConnectForm } from "../connect/connect-form";
import { PasteForm } from "../paste/paste-form";

/*
  "Try it yourself": the three live ways in, as tabs. Only the open tab is mounted. Each also has its own
  page (/playground, /paste, /connect).
*/
const TABS = [
  { id: "play", label: "Live playground", page: "/playground" },
  { id: "paste", label: "Paste an error", page: "/paste" },
  { id: "connect", label: "Connect your app", page: "/connect" },
] as const;

export function TryIt({ country }: { country: string | null }) {
  const [on, setOn] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tab = TABS[on];

  const onKey = (e: React.KeyboardEvent) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (on + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (on - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setOn(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="try">
      <div className="try-tabs" role="tablist" aria-label="Try JaagteRaho" onKeyDown={onKey}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`try-${t.id}`}
            aria-selected={i === on}
            aria-controls="try-panel"
            tabIndex={i === on ? 0 : -1}
            onClick={() => setOn(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="try-panel" role="tabpanel" id="try-panel" aria-labelledby={`try-${tab.id}`}>
        {tab.id === "play" && (
          <div className="try-connect">
            <p className="try-intro">
              Seven live apps we built and run. Pick one: a real bug is planted in its code every minute, the app really crashes, and you watch
              JaagteRaho decide, find the cause, write a fix and prove it with a hidden test it never sees. You do nothing. No sign-up.
            </p>
            <p>
              <Link className="btn btn-lg" href="/playground">
                Open the playground <span className="arrow" aria-hidden="true">→</span>
              </Link>
            </p>
            <p className="small soft">
              Prefer to break something yourself? <Link className="textlink" href="/demo">Break our exam portal</Link>.
            </p>
          </div>
        )}
        {tab.id === "paste" && (
          <PasteForm
            initialId={null}
            intro={
              <p className="try-intro">
                Paste a Python or JavaScript stack trace and the link to its public GitHub repository. You get the cause in plain words, and a fix if it
                passes every check.
              </p>
            }
          />
        )}
        {tab.id === "connect" && (
          <div className="try-connect">
            <p className="try-intro">
              Name your app, run one command in your project, deploy. Alerts go only to your Telegram. Free during HackGlobal 2026.
            </p>
            <div className="panel">
              <ConnectForm />
            </div>
          </div>
        )}
        <p className="try-more small soft">
          <Link className="textlink" href={tab.page}>
            Open this on its own page
          </Link>
        </p>
      </div>
    </div>
  );
}
