"use client";

import { useState } from "react";
import { WATCHER } from "../watcher";

type Result = { project: string; dsn: string; logs_url?: string; telegram: string | null; link_code: string; heal?: "ask" | "auto-after" };

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
      className="btn quiet"
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

export function ConnectForm({ initialName = "" }: { initialName?: string }) {
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
        body: JSON.stringify({ session: session(), name: form.get("name"), repo: form.get("repo"), consent: form.get("consent") === "on", heal: form.get("heal") }),
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
      <div className="copy-row">
        <pre>{text}</pre>
        <Copy text={text} />
      </div>
    );
    return (
      <div className="result" aria-live="polite">
        <h2 className="lead">Connected: {result.project}, with $5 of free AI credit</h2>
        <div className="step">
          <h3>Get alerts on Telegram</h3>
          {result.telegram ? (
            <span className="actions">
              <a className="btn" href={result.telegram} target="_blank" rel="noreferrer">
                Open Telegram and tap Start <span className="arrow">→</span>
              </a>
            </span>
          ) : (
            <p>
              Send <code>/start {result.link_code}</code> to the JaagteRaho bot.
            </p>
          )}
        </div>
        <div className="step">
          <h3>Connect your app: pick one</h3>
          <p>
            <b>Easiest: one command</b> in your project folder. It finds Django, Flask, FastAPI, Express or Next.js, adds the free error package and
            two lines, shows you every change first, then sends a test error. You get a ✅ on Telegram.
          </p>
          {box(command)}
          <p className="soft">
            <b>By hand:</b> if your app already uses a Sentry SDK, set this and restart (Python or Django):
          </p>
          {box(env)}
          <p className="soft">
            or in Node.js with <code>@sentry/node</code>:
          </p>
          {box(node)}
          {result.logs_url && (
            <>
              <p className="soft">
                <b>No code at all:</b> if your host can forward logs (a log drain), point it here. JaagteRaho picks out Python and Node.js errors and
                drops every other line.
              </p>
              {box(result.logs_url)}
            </>
          )}
        </div>
        <div className="step">
          <h3>Deploy as usual</h3>
          <p className="soft">
            On Telegram: <code>/critical /api/checkout checkout</code> marks a route that must always reach you, <code>/learn 2h</code> logs old
            errors quietly while you settle in, and <code>/github</code> gives read-only access to a private repository.
          </p>
          <p className="soft">
            <b>Your heal rule:</b>{" "}
            {result.heal === "auto-after"
              ? "heal on its own if a wake-up is not acknowledged in 3 minutes. Send /heal on Telegram for your server-only address: only errors sent with it can heal on their own. Until write access to your repository is set up, a heal arrives as a ready-to-apply diff and the calls go on."
              : "you approve every big fix."}{" "}
            Small bugs are fixed on their own with a quiet note (<code>/heal minor off</code> to stop it).{" "}
            Change it any time with <code>/heal</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="form result">
      <h2 className="lead">Name your app</h2>
      <label htmlFor="name">App name</label>
      <input className="input" id="name" name="name" type="text" required minLength={2} maxLength={40} placeholder="e.g. college-fest-site" defaultValue={initialName} />
      <label htmlFor="repo" className="gap">
        Its public GitHub repository <span className="soft">(optional: lets it read the code to explain causes)</span>
      </label>
      <input className="input" id="repo" name="repo" type="url" placeholder="https://github.com/you/your-app" />
      <fieldset>
        <legend>If a wake-up goes unanswered</legend>
        <p className="small soft">
          Either way, small bugs (a message, not a call) are fixed on their own when the fix passes every check, and you get a quiet note; send{" "}
          <code>/heal minor off</code> to approve those too.
        </p>
        <label htmlFor="heal-ask" className="check">
          <input id="heal-ask" name="heal" type="radio" value="ask" defaultChecked />
          <span>
            <b>Wait for me.</b> I approve every fix.
          </span>
        </label>
        <label htmlFor="heal-auto" className="check">
          <input id="heal-auto" name="heal" type="radio" value="auto-after" />
          <span>
            <b>Heal on its own after 3 minutes.</b> <span className="soft">Only fully checked fixes, never in login, payments, exams, config or CI, at most 2 a night,
            merged only behind your required checks, rolled back and you are woken again if the errors don&apos;t drop. Needs your server-only
            secret on errors and write access to your repository; without it you get the diff.</span>
          </span>
        </label>
      </fieldset>
      <label htmlFor="consent" className="check gap">
        <input id="consent" name="consent" type="checkbox" required />
        <span className="small">
          I run this app and agree to the <a href="/privacy">data note</a>: masked error reports and the files they name are processed by JaagteRaho
          and by Claude (Anthropic, United States). This is a hackathon prototype with no warranty.
        </span>
      </label>
      {error && <p className="form-error">{error}</p>}
      <span className="actions gap">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Connecting…" : "Connect my app"} <span className="arrow">→</span>
        </button>
      </span>
    </form>
  );
}
