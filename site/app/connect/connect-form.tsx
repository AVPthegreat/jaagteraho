"use client";

import { useState } from "react";
import { WATCHER } from "../watcher";

type Result = { project: string; dsn: string; logs_url?: string; telegram: string | null; link_code: string };

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

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost"
      style={{ minHeight: 36 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

const input = { minHeight: 44, padding: "0 12px", background: "var(--ink)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;

export function ConnectForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (form: FormData) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${WATCHER}/public/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: session(), name: form.get("name"), repo: form.get("repo"), consent: form.get("consent") === "on" }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Something went wrong.");
      else setResult(body as Result);
    } catch {
      setError("Could not reach the watcher. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const command = `npx jaagteraho init --dsn ${result.dsn}`;
    const env = `SENTRY_DSN=${result.dsn}`;
    const node = `Sentry.init({ dsn: "${result.dsn}" });`;
    const box = (text: string) => (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <pre className="diff" style={{ flex: "1 1 320px", minWidth: 0 }}>{text}</pre>
        <Copy text={text} />
      </div>
    );
    return (
      <div className="panel" style={{ gap: 18 }}>
        <p className="eyebrow">Connected · {result.project} · $5 of free AI credit</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <strong>1. Get alerts on Telegram</strong>
          {result.telegram ? (
            <span className="actions">
              <a className="btn" href={result.telegram} target="_blank" rel="noreferrer">
                Open Telegram and tap Start
              </a>
            </span>
          ) : (
            <span>
              Send <code className="mono">/start {result.link_code}</code> to the JaagteRaho bot.
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <strong>2. Connect your app: pick one</strong>
          <span>
            <b>Easiest: one command</b> in your project folder. It finds Django, Flask, FastAPI, Express or Next.js, adds the free error
            package and two lines, shows you every change first, then sends a test error. You get a ✅ on Telegram.
          </span>
          {box(command)}
          <span className="muted" style={{ fontSize: 14 }}>
            <b>By hand:</b> if your app already uses a Sentry SDK, set this and restart (Python or Django):
          </span>
          {box(env)}
          <span className="muted" style={{ fontSize: 14 }}>
            or in Node.js with <code className="mono">@sentry/node</code>:
          </span>
          {box(node)}
          {result.logs_url && (
            <>
              <span className="muted" style={{ fontSize: 14 }}>
                <b>No code at all:</b> if your host can forward logs (a log drain), point it here. JaagteRaho picks out Python and Node.js errors and
                drops every other line.
              </span>
              {box(result.logs_url)}
            </>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <strong>3. Deploy as usual</strong>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            On Telegram: <code className="mono">/critical /api/checkout checkout</code> marks a route that must always reach you,{" "}
            <code className="mono">/learn 2h</code> logs old errors quietly while you settle in, and <code className="mono">/github</code> gives
            read-only access to a private repository. Fixes arrive as diffs: JaagteRaho never writes to your code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="panel" style={{ maxWidth: 640 }}>
      <label htmlFor="name" style={{ fontWeight: 700 }}>
        App name
      </label>
      <input id="name" name="name" type="text" required minLength={2} maxLength={40} placeholder="e.g. college-fest-site" style={input} />
      <label htmlFor="repo" style={{ fontWeight: 700 }}>
        Its public GitHub repository <span className="muted" style={{ fontWeight: 400 }}>(optional: lets it read the code to explain causes)</span>
      </label>
      <input id="repo" name="repo" type="url" placeholder="https://github.com/you/your-app" style={input} />
      <label htmlFor="consent" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input id="consent" name="consent" type="checkbox" required style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--lantern)" }} />
        <span style={{ fontSize: 14 }}>
          I run this app and agree to the <a href="/privacy">data note</a>: masked error reports and the files they name are processed by
          JaagteRaho and by Claude (Anthropic, United States). This is a hackathon prototype with no warranty.
        </span>
      </label>
      {error && <p style={{ margin: 0, color: "var(--wake)" }}>{error}</p>}
      <span className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Connecting…" : "Connect my app"}
        </button>
      </span>
    </form>
  );
}
