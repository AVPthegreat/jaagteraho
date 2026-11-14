"use client";

import { useState } from "react";

/*
  Shown when a run ends with our hidden test passed: one line worth sharing, a link that opens the same
  app and bug, and plain share links (X, LinkedIn) with no tracking parameters.
*/
export function ShareCard({ app, appName, caseId, bugTitle, seconds, rupees }: { app: string; appName: string; caseId: string; bugTitle: string; seconds: number | null; rupees: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/playground?app=${encodeURIComponent(app)}${caseId ? `&case=${encodeURIComponent(caseId)}` : ""}`;
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const line = `JaagteRaho fixed a real bug${seconds !== null ? ` in ${seconds} s` : ""}${rupees ? ` for ${rupees}` : ""}`;
  const text = `${line}: ${bugTitle} in ${appName}, proved by a hidden test it never saw. Plant one yourself:`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className="share" data-in>
      <div className="share-card">
        <p className="share-tag">Live playground · {appName}</p>
        <p className="share-line">{line}.</p>
        <p className="share-sub">
          {bugTitle} <span className="share-pass">✓ hidden test passed</span>
        </p>
      </div>
      <div className="share-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? "Link copied" : "Copy link"}
        </button>
        <a className="btn btn-ghost btn-sm" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
          Share on X
        </a>
        <a className="btn btn-ghost btn-sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
          Share on LinkedIn
        </a>
      </div>
    </div>
  );
}
