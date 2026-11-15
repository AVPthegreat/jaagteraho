"use client";

import { useEffect, useRef, useState } from "react";
import { Diff, SUBMIT_DIFF } from "../ui/alert-card";
import { softScroll } from "../ui/smooth-scroll";
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

export function PasteForm({ initialId, intro }: { initialId: string | null; intro?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const log = useRef<HTMLDivElement>(null);

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
    // On a phone or tablet the answer panel is a screen below the button: bring it into view.
    if (window.matchMedia("(max-width: 979px)").matches && log.current) {
      const soft = softScroll();
      if (soft) soft.scrollTo(log.current, { offset: -96 });
      else log.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
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
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="split">
      <div className="side">
        {intro}
        <form
          className="form panel"
          data-rv
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
        >
          <label htmlFor="repo">Public GitHub repository</label>
          <input className="input" id="repo" name="repo" type="url" required placeholder="https://github.com/you/your-app" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
          <label htmlFor="tb" className="gap">
            Traceback or stack trace (Python, Node.js or browser)
          </label>
          <textarea className="input" id="tb" name="tb" required rows={12} placeholder={SAMPLE} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <p className="soft">
            We read only the files your traceback names, from the public repository. Nothing is written to it. Emails, tokens and keys in the traceback
            are masked before the AI sees it. 3 diagnoses per person per day.
          </p>
          <span className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Reading your code…" : "Diagnose"} <span className="arrow">→</span>
            </button>
          </span>
        </form>
      </div>

      <div className="main" data-rv style={{ "--d": 1 } as React.CSSProperties}>
        <div className="log" data-ui aria-live="polite" ref={log} style={{ scrollMarginTop: 96 }}>
          <div className="log-head">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="label">{result ? result.repo : "Diagnosis"}</span>
            {result && (
              <button type="button" className="btn quiet copy-btn" onClick={share}>
                <span key={copied ? "d" : "c"} className="swap">
                  {copied ? "Link copied" : "Copy share link"}
                </span>
              </button>
            )}
          </div>
          {error && (
            <p className="form-error log-error" role="alert">
              {error}
            </p>
          )}
          {!error && !result && busy && (
            <p className="empty" style={{ paddingBottom: 22 }}>
              Reading the files your traceback names and working out the cause. This takes about 10 seconds.
            </p>
          )}
          {!error && !result && !busy && (
            <div aria-label="Example of a diagnosis">
              <p className="empty">Your diagnosis appears here. Below, greyed out, is one from our demo exam portal so you know what to expect:</p>
              <ol style={{ opacity: 0.72 }} aria-hidden="true">
                <li className="entry">
                  <time>error</time>
                  <div className="body">
                    <code className="code">KeyError: &apos;language&apos;</code>
                    <span className="muted">Read: portal/views.py, portal/submissions.py</span>
                  </div>
                </li>
                <li className="entry">
                  <time>cause</time>
                  <div className="body">
                    <span className="title">The Submit button never says which language the code is in, and the server insists on knowing it.</span>
                    <code className="code">portal/submissions.py · line 14 · likely</code>
                  </div>
                </li>
                <li className="entry">
                  <time>fix</time>
                  <div className="body">
                    <span className="stamp-row">
                      <span className="title">Proposed fix</span>
                      <span className="tag ok">all checks passed</span>
                      <span className="tag">AI-written</span>
                    </span>
                    <Diff text={SUBMIT_DIFF} />
                  </div>
                </li>
              </ol>
            </div>
          )}
          {result && (
            <ol>
              <li className="entry">
                <time>error</time>
                <div className="body">
                  <code className="code">{result.exception}</code>
                  <span className="muted">Read: {result.files.join(", ")}</span>
                </div>
              </li>
              <li className="entry">
                <time>cause</time>
                <div className="body">
                  <span className="title">{result.cause_plain}</span>
                  <code className="code">
                    {result.file} · line {result.line} · {result.confidence_words}
                  </code>
                  <span className="muted">{result.cause_technical}</span>
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
                        <span className="muted">The reviewer flagged: {result.fix.reasons.join("; ")}. Read it carefully before applying.</span>
                      )}
                      <Diff text={result.fix.diff} />
                      <span className="muted">Check: {result.test_hint}</span>
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
    </div>
  );
}
