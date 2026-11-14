"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WATCHER } from "./watcher";

type Flow = "submit" | "exam" | "pay";
// Each button calls one page of the demo portal that has a bug planted in it on purpose.
const FLOWS: Array<{ id: Flow; label: string; bug: string }> = [
  { id: "submit", label: "Submit code", bug: "A student submits code without picking a language. The server expects one and crashes." },
  { id: "exam", label: "Start exam", bug: "The exam's start time is worked out without a time zone, so opening the exam crashes." },
  { id: "pay", label: "Pay fee", bug: "A student pays with no coupon. The fee maths divides by the number of coupons: zero." },
];

type Votes = Record<string, { value: string; count: number; of: number }>;
type FeedEvent = { type: string; at: string; incident_id: number; data: Record<string, unknown> };
type Entry = { key: string; t: number; ev: FeedEvent };

const STAMP: Record<string, { text: string; cls: string }> = {
  wake: { text: "WOKE OWNER", cls: "wake" },
  notify: { text: "NOTIFIED", cls: "notify" },
  log: { text: "LOGGED", cls: "quiet" },
  ignore: { text: "IGNORED", cls: "quiet" },
};

function newSession() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "v" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function loadSession(): string {
  try {
    const s = localStorage.getItem("jr_session");
    if (s && /^[A-Za-z0-9_-]{8,64}$/.test(s)) return s;
    const fresh = newSession();
    localStorage.setItem("jr_session", fresh);
    return fresh;
  } catch {
    return newSession();
  }
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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

export function BreakIt({ country }: { country: string | null }) {
  const [session, setSession] = useState<string | null>(null);
  const [exam, setExam] = useState(true);
  const [heal, setHeal] = useState(true);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [started, setStarted] = useState<number | null>(null);
  const [stopped, setStopped] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [signed, setSigned] = useState(false);
  const [approvedFix, setApprovedFix] = useState<number | null>(null);
  const [healedFix, setHealedFix] = useState<number | null>(null);
  const startedRef = useRef<number | null>(null);
  const healRef = useRef(true);
  useEffect(() => {
    healRef.current = heal;
  }, [heal]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setSession(loadSession()), []);

  // Live feed for this visitor's session.
  useEffect(() => {
    if (!session) return;
    const es = new EventSource(`${WATCHER}/public/feed/${session}`);
    const push = (msg: MessageEvent) => {
      const ev = JSON.parse(msg.data) as FeedEvent;
      const t = startedRef.current ? (Date.now() - startedRef.current) / 1000 : 0;
      if (ev.type === "fixed" || ev.type === "heal") setStopped(Date.now());
      if (ev.type === "fix" && !(ev.data.status !== "rejected" && ev.data.level === "recommended" && healRef.current)) setStopped(Date.now());
      if (ev.type === "heal" && ev.data.status === "verified") setHealedFix(Number(ev.data.fix_id));
      // The page writes its own line once the fixed build answers, so "fixed" is not repeated.
      if (ev.type === "fixed") return;
      setEntries((list) => [...list, { key: `${ev.type}-${ev.at}-${list.length}`, t, ev }]);
    };
    for (const type of ["error", "decision", "voice", "cause", "fix", "fixed", "heal"]) es.addEventListener(type, push);
    return () => es.close();
  }, [session]);

  useEffect(() => {
    if (!started || stopped) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [started, stopped]);

  const run = useCallback(
    async (f: Flow, keepLog = false) => {
      if (!session) return;
      setBusy(true);
      setFlow(f);
      setNote(null);
      if (!keepLog) {
        setEntries([]);
        setApprovedFix(null);
        setHealedFix(null);
        startedRef.current = Date.now();
        setStarted(Date.now());
        setStopped(null);
        // On a phone the logbook is below the buttons: bring it into view so the run is seen.
        if (window.innerWidth < 980) logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      try {
        const res = await fetch(`${WATCHER}/public/break`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session, flow: f, exam, country, heal }),
        });
        const body = (await res.json()) as { error?: string; build?: string; status?: number; result?: { ok?: boolean; error?: string } };
        if (!res.ok) setNote(body.error ?? "Something went wrong.");
        else if (body.build === "fixed") {
          setNote(
            body.status && body.status < 500
              ? body.result?.error
                ? `It works now. Instead of a server error, the student sees: “${body.result.error}”`
                : "It works now. The portal accepted the request."
              : "Still failing on the fixed build.",
          );
          setStopped(Date.now());
        }
      } catch {
        setNote("Could not reach the watcher. Try again in a moment.");
      } finally {
        setBusy(false);
      }
    },
    [session, exam, country, heal],
  );

  // Undo a heal: this session goes back to the broken build, so the bug is there again.
  const undo = async (healId: number) => {
    if (!session) return;
    const res = await fetch(`${WATCHER}/public/undo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, heal_id: healId }),
    }).catch(() => null);
    if (!res?.ok) return setNote("Nothing to undo.");
    setApprovedFix(null);
    setHealedFix(null);
  };

  const approve = async (fixId: number) => {
    if (!session || !flow) return;
    setApproving(true);
    const res = await fetch(`${WATCHER}/public/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, flow, fix_id: fixId }),
    }).catch(() => null);
    setApproving(false);
    if (!res?.ok) return setNote("That fix cannot be approved.");
    setApprovedFix(fixId);
    await run(flow, true);
  };

  const startOver = () => {
    const fresh = newSession();
    try {
      localStorage.setItem("jr_session", fresh);
    } catch {}
    setSession(fresh);
    setEntries([]);
    setStarted(null);
    setStopped(null);
    setNote(null);
    setFlow(null);
  };

  const sign = async (form: FormData) => {
    if (!session) return;
    const res = await fetch(`${WATCHER}/public/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, name: form.get("who"), country: form.get("country"), live_app: form.get("live") === "on" }),
    }).catch(() => null);
    if (res?.ok) setSigned(true);
  };

  const elapsed = started ? ((stopped ?? now) - started) / 1000 : 0;
  const flowLabel = FLOWS.find((x) => x.id === flow)?.label;

  return (
    <>
      <div className="demo">
        <div className="panel demo-controls">
          <label className="switch" htmlFor="exam">
            <span>
              <strong>Exam in progress</strong>
              <small>
                On: we tell the watchman an exam is running, so a failure here wakes the owner (rule 2). Off: the owner is usually sent a message instead.
              </small>
            </span>
            <input id="exam" type="checkbox" checked={exam} onChange={(e) => setExam(e.target.checked)} />
          </label>
          <label className="switch" htmlFor="heal">
            <span>
              <strong>Heal on its own</strong>
              <small>
                On: your rule lets a fix go in without you, but only if it passed every check and its own test proved it; then the same request is
                sent again to prove it works. Off: the fix waits for your Approve.
              </small>
            </span>
            <input id="heal" type="checkbox" checked={heal} onChange={(e) => setHeal(e.target.checked)} />
          </label>
          <hr className="hr" />
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            Pick a page of the portal to break
          </p>
          <div className="flows">
            {FLOWS.map((f) => (
              <button key={f.id} type="button" className="flow" data-active={flow === f.id} disabled={busy || !session} onClick={() => run(f.id)}>
                <strong>{f.label}</strong>
                <span className="flow-bug">{f.bug}</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Pressing a button sends one real request to the portal, which crashes. No sign-up. You only press buttons, so nothing you type reaches
            the AI. Each run uses a little of our AI credit, so the demo has a per-person limit.{" "}
            <button type="button" className="linkish" onClick={startOver}>
              Start over
            </button>{" "}
            clears your run and any fix you approved or healed.
          </p>
        </div>

        <div className="log" aria-live="polite" ref={logRef} style={{ scrollMarginTop: 12 }}>
          <div className="log-head">
            <span className="label">{flowLabel ? `Your run · ${flowLabel} · exam ${exam ? "on" : "off"}` : "Your run · the owner's logbook"}</span>
            <span className="timer" aria-label={`Elapsed ${Math.round(elapsed)} seconds`}>
              {fmt(elapsed)}
            </span>
          </div>
          {entries.length === 0 && !note ? (
            <div aria-label="Example of a run">
              <p className="empty" style={{ paddingBottom: 0 }}>
                Nothing broken yet. Press a button and this logbook fills in live, the way the owner would see it. Below, greyed out, is an earlier run
                so you know what to expect:
              </p>
              <ol style={{ opacity: 0.72 }} aria-hidden="true">
                <li className="entry">
                  <time>00:00</time>
                  <div className="body">
                    <span className="title">Error received</span>
                    <span className="code">KeyError: &apos;language&apos; · /api/submit</span>
                  </div>
                </li>
                <li className="entry">
                  <time>00:02</time>
                  <div className="body">
                    <div className="stamp-row">
                      <span className="stamp wake" style={{ animation: "none" }}>
                        WOKE OWNER
                      </span>
                      <span className="title">Rule 2: critical flow failing during an exam</span>
                    </div>
                  </div>
                </li>
                <li className="entry">
                  <time>00:06</time>
                  <div className="body">
                    <span className="title">Cause, in plain words</span>
                    <span>The Submit button never says which language the code is in, and the server insists on knowing it.</span>
                  </div>
                </li>
                <li className="entry">
                  <time>00:10</time>
                  <div className="body">
                    <div className="stamp-row">
                      <span className="title">Fix proposed</span>
                      <span className="tag ok">all checks passed</span>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            <ol>
              {entries.map(({ key, t, ev }) => (
                <li key={key} className="entry">
                  <time>{fmt(t)}</time>
                  <div className="body">
                    <EntryBody ev={ev} onApprove={approve} onUndo={undo} approving={approving} approvedFix={approvedFix} healedFix={healedFix} audioRef={audioRef} />
                  </div>
                </li>
              ))}
              {note && (
                <li className="entry">
                  <time>{fmt(elapsed)}</time>
                  <div className="body">
                    <span className="title">{note}</span>
                  </div>
                </li>
              )}
            </ol>
          )}
        </div>
      </div>

      <div className="sign-box" aria-labelledby="sign-h">
        <h3 id="sign-h">Tried it? Sign the logbook</h3>
        {signed ? (
          <p>Thank you. You are in the logbook.</p>
        ) : (
          <form className="sign" action={sign}>
            <div className="field">
              <label htmlFor="who">Name or handle</label>
              <input id="who" name="who" type="text" placeholder="e.g. @riya_codes" required maxLength={40} />
            </div>
            <div className="field">
              <label htmlFor="country">Country</label>
              <input id="country" name="country" type="text" defaultValue={country ?? ""} required maxLength={40} />
            </div>
            <label className="check" htmlFor="live">
              <input id="live" name="live" type="checkbox" /> I run a live app
            </label>
            <button className="btn ghost" type="submit" style={{ color: "var(--lantern)", borderColor: "var(--lantern)" }}>
              Sign
            </button>
          </form>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Optional. Signing adds your name to the count of people who tried the demo. We keep only what you type here, to count real users for
          the hackathon.
        </p>
      </div>
    </>
  );
}

function EntryBody({
  ev,
  onApprove,
  onUndo,
  approving,
  approvedFix,
  healedFix,
  audioRef,
}: {
  ev: FeedEvent;
  onApprove: (fixId: number) => void;
  onUndo: (healId: number) => void;
  approving: boolean;
  approvedFix: number | null;
  healedFix: number | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const d = ev.data;
  switch (ev.type) {
    case "error":
      return (
        <>
          <span className="title">Error received</span>
          <span className="code">
            {String(d.exception_type)}: {String(d.message)} · {String(d.route ?? "")}
          </span>
        </>
      );
    case "decision": {
      const s = STAMP[String(d.action)] ?? STAMP.log;
      const votes = d.votes as Votes;
      return (
        <div className="stamp-row">
          <span className={`stamp ${s.cls}`}>{s.text}</span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="title">
              Rule {String(d.rule)}: {String(d.rule_text)}
            </span>
            <span className="muted" style={{ fontSize: 14 }}>
              {votes.severity
                ? `Claude: severity ${votes.severity.value} ${String(d.severity_word ?? "")} (${votes.severity.count} of ${votes.severity.of}) · uncalibrated`
                : "Decided by rules alone"}
              {Number(d.rule) >= 2 && Number(d.rule) <= 4 ? " · no model can lower this rule" : ""}
            </span>
          </span>
        </div>
      );
    }
    case "voice":
      return (
        <div className="stamp-row">
          <button
            type="button"
            className="play"
            aria-label="Play the wake-up call"
            onClick={() => {
              const a = new Audio(`${WATCHER}${String(d.url)}?format=mp3`);
              audioRef.current = a;
              void a.play();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5v11l9-5.5-9-5.5Z" fill="#f2b441" />
            </svg>
          </button>
          <span className="title">Wake-up call sent to the owner&apos;s phone</span>
        </div>
      );
    case "cause":
      if (d.unavailable) return <span className="title">{String(d.unavailable)}</span>;
      return (
        <>
          <span className="title">Cause, in plain words{d.replayed ? " (replayed)" : ""}</span>
          <span>{String(d.cause_plain)}</span>
          <span className="code">
            {String(d.file)} · line {String(d.line)} · {String(d.confidence_words)}
            {d.replayed && d.recorded_at ? ` · recorded ${new Date(String(d.recorded_at)).toLocaleString()}` : ""}
          </span>
        </>
      );
    case "fix":
      if (d.status === "rejected") {
        return (
          <>
            <span className="stamp-row">
              <span className="title">Fix withheld</span>
              <span className="tag warn">safety rule</span>
            </span>
            <span>{(d.reasons as string[]).join("; ")}. No fix is shown: the owner gets the cause and fixes this one by hand.</span>
          </>
        );
      }
      if (d.level === "caution") {
        return (
          <>
            <span className="stamp-row">
              <span className="title">Fix proposed: use with care</span>
              <span className="tag warn">open concerns</span>
              <span className="tag">AI-written</span>
            </span>
            {d.diff ? <Diff text={String(d.diff)} /> : null}
            <span className="muted" style={{ fontSize: 13 }}>
              Code checks passed, but the reviewer flagged: {(d.reasons as string[]).join("; ")}. The owner reads it and decides; there is no
              one-tap approve for a fix like this, so the demo stops here.
            </span>
          </>
        );
      }
      return (
        <>
          <span className="stamp-row">
            <span className="title">Fix proposed</span>
            <span className="tag ok">all checks passed</span>
            <span className="tag">AI-written</span>
            {(d.test_run as { verdict?: string } | null)?.verdict === "proved" && <span className="tag ok">proved by a test</span>}
          </span>
          {d.diff ? <Diff text={String(d.diff)} /> : null}
          {(d.test_run as { verdict?: string; note?: string } | null)?.verdict === "proved" && (
            <details>
              <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>
                Proof: Claude also wrote a test. It fails on the current code and passes with the fix.
              </summary>
              {d.test_code ? <pre className="diff">{String(d.test_code)}</pre> : null}
            </details>
          )}
          {healedFix === Number(d.fix_id) ? (
            <span className="stamp-row">
              <span className="tag ok">healed on its own</span>
            </span>
          ) : approvedFix === Number(d.fix_id) ? (
            <span className="stamp-row">
              <span className="tag ok">approved for your session</span>
              <span className="muted" style={{ fontSize: 13 }}>
                Trying the same flow again on the fixed build…
              </span>
            </span>
          ) : (
            <>
              <span className="actions">
                <button type="button" className="btn" disabled={approving} onClick={() => onApprove(Number(d.fix_id))}>
                  {approving ? "Approving…" : "Approve fix"}
                </button>
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                Approve switches only your session to the fixed copy of the portal, then presses the same button again. On your own app, Approve or
                a heal opens a pull request your checks must pass (with write access you give), or you get this change as a diff.
              </span>
            </>
          )}
        </>
      );
    case "fixed":
      return <span className="title">Fixed. The flow works again.</span>;
    case "heal": {
      const proof = d.proof as { status?: number; result?: { error?: string } | null } | undefined;
      if (d.status === "verified")
        return (
          <>
            <span className="stamp-row">
              <span className="title">Healed on its own</span>
              <span className="tag ok">your rule allowed it</span>
            </span>
            <span>
              Your session now runs the fixed build. Proof: the same request was sent again and answered {String(proof?.status ?? "")}
              {proof?.result?.error ? `, telling the student “${proof.result.error}” instead of crashing` : ", with no crash"}.
            </span>
            <span className="actions">
              <button type="button" className="btn ghost" onClick={() => onUndo(Number(d.heal_id))}>
                Undo
              </button>
            </span>
          </>
        );
      if (d.status === "skipped")
        return (
          <>
            <span className="stamp-row">
              <span className="title">Not healed on its own</span>
              <span className="tag warn">rule</span>
            </span>
            <span>Held back because {String(d.reason)}. It waits for a person.</span>
          </>
        );
      if (d.status === "rolled_back") return <span className="title">Heal rolled back: {String(d.reason)}.</span>;
      if (d.status === "undone") return <span className="title">Undone. Your session is back on the broken build; press the button to see the bug again.</span>;
      return null;
    }
    default:
      return null;
  }
}
