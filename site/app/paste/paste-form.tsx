"use client";

import { useEffect, useState } from "react";
import { WATCHER } from "../watcher";

type Result = {
  id: string;
  repo: string;
  exception: string;
  files: string[];
  cause_plain: string;
  cause_technical: string;
  file: string;
  line: number;
  confidence_words: string;
  test_hint: string;
  fix: { status: "shown" | "rejected"; level?: "recommended" | "caution" | "withheld"; diff: string | null; reasons: string[] };
};

const SAMPLE = `Traceback (most recent call last):
  File "/app/shop/views.py", line 42, in checkout
    total = cart_total(items)
  File "/app/shop/pricing.py", line 9, in cart_total
    return sum(i["price"] for i in items) / len(items)
ZeroDivisionError: division by zero`;

function session(): string {
  try {
    const s = localStorage.getItem("jr_session");
    if (s) return s;
  } catch {}
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  const fresh = "v" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem("jr_session", fresh);
  } catch {}
  return fresh;
}

function Diff({ text }: { text: string }) {
  return (
    <pre className="diff">
      {text.split("\n").map((l, i) => (
        <span key={i} className={l.startsWith("---") || l.startsWith("+++") || l.startsWith("@@") ? "h" : l.startsWith("-") ? "d" : l.startsWith("+") ? "a" : ""}>
          {l}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

export function PasteForm({ initialId }: { initialId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initialId) return;
    fetch(`${WATCHER}/public/paste/${initialId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r: Result | null) => r && setResult(r))
      .catch(() => undefined);
  }, [initialId]);

  const submit = async (form: FormData) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${WATCHER}/public/paste`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: session(), traceback: form.get("tb"), repo: form.get("repo") }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Something went wrong.");
      else {
        setResult(body as Result);
        history.replaceState(null, "", `/paste?id=${body.id}`);
      }
    } catch {
      setError("Could not reach the watcher. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
      <form action={submit} className="panel" style={{ flex: "1 1 420px", minWidth: 0 }}>
        <label htmlFor="repo" style={{ fontWeight: 700 }}>
          Public GitHub repository
        </label>
        <input
          id="repo"
          name="repo"
          type="url"
          required
          placeholder="https://github.com/you/your-app"
          style={{ minHeight: 44, padding: "0 12px", background: "var(--ink)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }}
        />
        <label htmlFor="tb" style={{ fontWeight: 700 }}>
          Traceback or stack trace (Python, Node.js or browser)
        </label>
        <textarea
          id="tb"
          name="tb"
          required
          rows={12}
          placeholder={SAMPLE}
          className="mono"
          style={{ padding: 12, background: "var(--ink)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, resize: "vertical" }}
        />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          We read only the files your traceback names, from the public repository. Nothing is written to it. Emails, tokens and keys in the
          traceback are masked before the AI sees it. 3 diagnoses per person per day.
        </p>
        <span className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Reading your code…" : "Diagnose"}
          </button>
        </span>
      </form>

      <div className="log" style={{ flex: "1 1 520px" }} aria-live="polite">
        <div className="log-head">
          <span className="label">{result ? result.repo : "Diagnosis"}</span>
          {result && (
            <button type="button" className="btn ghost" onClick={share} style={{ minHeight: 36 }}>
              {copied ? "Link copied" : "Copy share link"}
            </button>
          )}
        </div>
        {error && <p className="empty">{error}</p>}
        {!error && !result && <p className="empty">{busy ? "Reading the files your traceback names and working out the cause. This takes about 10 seconds." : "Your diagnosis appears here."}</p>}
        {result && (
          <ol>
            <li className="entry">
              <time>error</time>
              <div className="body">
                <span className="code">{result.exception}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  Read: {result.files.join(", ")}
                </span>
              </div>
            </li>
            <li className="entry">
              <time>cause</time>
              <div className="body">
                <span className="title">{result.cause_plain}</span>
                <span className="code">
                  {result.file} · line {result.line} · {result.confidence_words}
                </span>
                <span className="muted" style={{ fontSize: 14 }}>
                  {result.cause_technical}
                </span>
              </div>
            </li>
            <li className="entry">
              <time>fix</time>
              <div className="body">
                {result.fix.status === "shown" && result.fix.diff ? (
                  <>
                    <span className="stamp-row">
                      <span className="title">{result.fix.level === "caution" ? "Proposed fix: use with care" : "Proposed fix"}</span>
                      {result.fix.level === "caution" ? <span className="tag warn">open concerns</span> : <span className="tag ok">all checks passed</span>}
                      <span className="tag">AI-written</span>
                    </span>
                    {result.fix.level === "caution" && (
                      <span className="muted" style={{ fontSize: 13 }}>
                        The reviewer flagged: {result.fix.reasons.join("; ")}. Read it carefully before applying.
                      </span>
                    )}
                    <Diff text={result.fix.diff} />
                    <span className="muted" style={{ fontSize: 13 }}>
                      Check: {result.test_hint}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="stamp-row">
                      <span className="title">No fix shown</span>
                      <span className="tag warn">safety rule</span>
                    </span>
                    <span>{result.fix.reasons.join("; ")}.</span>
                  </>
                )}
              </div>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
