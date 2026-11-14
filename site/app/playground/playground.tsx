"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Diff } from "../ui/alert-card";
import { WATCHER } from "../watcher";
import { appTitle, loadSession, type AppInfo, type BugCase, type PlayEvent, type Scorecard } from "./play";

/*
  The Live playground, in three steps: pick an app, pick a bug, watch it fix. The stage shows the app as
  an app (one real action, red when it crashes, green once the fix is in) beside JaagteRaho's five steps.
  Everything is real: the visitor's own copy of the app, in our isolated runner, through the real pipeline.
  Details (diff, traceback, votes, files) live in one drawer.
*/

type Run = { run_id: number; app: string; case_id: string; events: PlayEvent[]; state: "running" | "broken" | "fixed"; approvable: boolean; heal: "ask" | "auto"; scorecard: Scorecard | null };
type UseResult = { fixed: boolean; answered: boolean; response: unknown; error: string | null; traceback: string | null };
type Conn = "connecting" | "live" | "reconnecting";
type Stage = 1 | 2 | 3;

const INR_PER_USD = 84;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Adds one live step to the visitor's run and moves its state along. */
function applyStep(r: Run, ev: PlayEvent): Run {
  const next: Run = { ...r, events: [...r.events, ev] };
  if (ev.step === "ready") next.approvable = Boolean(ev.data.approvable);
  if (ev.step === "done") {
    if (isObj(ev.data.scorecard)) next.scorecard = ev.data.scorecard as Scorecard;
    if (next.state === "running") next.state = "broken";
  }
  if (ev.step === "failed" || ev.step === "undone") next.state = "broken";
  if (ev.step === "hidden_test" && r.state !== "running") next.state = "fixed";
  return next;
}

/** Steps arrive as JSON from the wire: keep only well-formed ones. */
function toEvent(v: unknown): PlayEvent | null {
  if (!isObj(v) || typeof v.step !== "string" || typeof v.run_id !== "number") return null;
  return { ...(v as PlayEvent), t: typeof v.t === "number" ? v.t : 0, data: isObj(v.data) ? v.data : {} };
}
function parse(s: unknown): unknown {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const ACTION: Record<string, { label: string; cls: string; say: string }> = {
  wake: { label: "Wake", cls: "wake", say: "wake the owner" },
  notify: { label: "Notify", cls: "notify", say: "message the owner" },
  log: { label: "Log", cls: "quiet", say: "log it quietly" },
  ignore: { label: "Ignore", cls: "quiet", say: "ignore it" },
};

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const r = await fetch(`${WATCHER}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok, data: isObj(data) ? data : ({} as T & { error?: string }) };
  } catch {
    return { ok: false, data: { error: "The live server did not answer. It may be restarting: try again in a few seconds." } as T & { error?: string } };
  }
}

/** One short line for what is happening now. */
function narrate(ev: PlayEvent | undefined, app: string): string {
  if (!ev) return "Planting the bug…";
  const d = ev.data;
  const name = appTitle(app);
  switch (ev.step) {
    case "plant":
      return `Bug planted in a fresh copy of ${name}. Starting it…`;
    case "crash":
      return `${name} just crashed for a real request.`;
    case "connected":
      return "JaagteRaho caught the error on its own.";
    case "decision":
      return `Decided to ${ACTION[String(d.action)]?.say ?? String(d.action)}.`;
    case "cause":
      return d.unavailable ? String(d.unavailable) : "Cause found. Writing a fix…";
    case "gate":
      return d.level === "recommended" ? "Fix written. Checking it…" : "Fix written, but the checks held it back.";
    case "own_test":
      return d.verdict === "proved" ? "Its own test proved the fix." : "Its own test could not prove the fix.";
    case "ready":
      if (!d.approvable) return "This fix cannot be applied.";
      return d.heal === "auto" ? "Fix ready. Healing on its own…" : "Fix ready. Approve it to apply it.";
    case "note":
      return String(d.text ?? "");
    case "applied":
      return d.by === "healed" ? "Healed on its own. Our hidden test is checking it…" : "Applied. Our hidden test is checking it…";
    case "hidden_test":
      return d.result === "passed" ? "Fixed. Use the app: it works now." : d.result === "failed" ? "Our hidden test failed. Undo this fix." : "Applied; our hidden test could not run.";
    case "done":
      return "Done.";
    case "undone":
      return "Undone. The bug is back.";
    case "used_crash":
      return "It crashed for your request.";
    case "used_ok":
      return "It worked for your request.";
    case "failed":
      return String(d.note ?? "This run could not finish.");
    default:
      return "";
  }
}

/** The app's real JSON answer, said as one friendly sentence. */
function friendly(resp: unknown): string {
  if (resp === null || resp === undefined) return "It ran without an error.";
  if (typeof resp === "string") return resp.slice(0, 140);
  if (typeof resp === "number" || typeof resp === "boolean") return `It answered ${String(resp)}.`;
  if (Array.isArray(resp)) return `It answered with ${resp.length} ${resp.length === 1 ? "item" : "items"}.`;
  if (isObj(resp)) {
    for (const k of ["message", "detail", "status", "result"]) if (typeof resp[k] === "string") return String(resp[k]).slice(0, 140);
    const parts = Object.entries(resp)
      .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
      .slice(0, 3)
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`);
    return parts.length ? `It worked · ${parts.join(" · ")}` : "It worked.";
  }
  return "It worked.";
}

const secs = (t?: number) => (typeof t === "number" && Number.isFinite(t) ? `${t.toFixed(1)} s` : "");
const rupees = (usd: number) => (Number.isFinite(usd) ? `₹${(usd * INR_PER_USD).toFixed(usd * INR_PER_USD < 10 ? 1 : 0)}` : "");

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const ICONS = {
  caught: "M12 9v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  decided: "M12 4v16M6 8h12M6 8l-3 6a3 3 0 0 0 6 0L6 8Zm12 0-3 6a3 3 0 0 0 6 0l-3-6Z",
  cause: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  checked: "M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3Zm-3 9 2 2 4-4",
  fixed: "M4 12.5l5 5L20 6.5",
};

export function Playground() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [appsDown, setAppsDown] = useState(false);
  const [app, setApp] = useState<string | null>(null);
  const [bug, setBug] = useState<string>("surprise");
  const [exam, setExam] = useState(false);
  const [heal, setHeal] = useState<"ask" | "auto">("ask");
  const [stage, setStage] = useState<Stage>(1);
  const [session, setSession] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "plant" | "use" | "approve" | "undo">(null);
  const [used, setUsed] = useState<UseResult | null>(null);
  const early = useRef<PlayEvent[]>([]);
  const panel = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const restored = useRef(false);

  // The list of apps, retried with backoff while the live server restarts.
  useEffect(() => {
    setSession(loadSession());
    const fromUrl = new URLSearchParams(window.location.search).get("app");
    if (fromUrl && /^[a-z]{2,20}$/.test(fromUrl)) {
      setApp(fromUrl);
      setStage(2);
    }
    let alive = true;
    let wait = 1000;
    const load = () =>
      fetch(`${WATCHER}/public/playground/apps`, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { apps?: AppInfo[] }) => {
          if (!alive) return;
          if (!Array.isArray(d?.apps)) throw new Error("bad list");
          setApps(d.apps.filter((a) => isObj(a) && typeof a.name === "string").map((a) => ({ ...a, cases: Array.isArray(a.cases) ? a.cases : [] })));
          setAppsDown(false);
        })
        .catch(() => {
          if (!alive) return;
          setAppsDown(true);
          setTimeout(load, wait);
          wait = Math.min(wait * 2, 30_000);
        });
    void load();
    return () => {
      alive = false;
    };
  }, []);

  // The visitor's own feed. A ticket works once, so every reconnect asks for a fresh one, with backoff;
  // the snapshot on reconnect resumes the run where it was and nothing on screen is lost.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    let es: EventSource | null = null;
    let wait = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const retry = () => {
      if (!alive) return;
      setConn("reconnecting");
      timer = setTimeout(connect, wait);
      wait = Math.min(wait * 2, 30_000);
    };
    // The session id is a credential: it is POSTed for a one-time ticket, and only the ticket goes in the URL.
    const connect = async () => {
      if (!alive) return;
      const t = await post<{ ticket: string }>("/public/playground/mine", { session });
      if (!alive) return;
      if (!t.ok || !t.data.ticket) return retry();
      es = new EventSource(`${WATCHER}/public/playground/mine/${encodeURIComponent(t.data.ticket)}`);
      es.addEventListener("snapshot", (m) => {
        wait = 1000;
        setConn("live");
        const s = parse((m as MessageEvent).data);
        const r = isObj(s) && isObj(s.run) ? (s.run as unknown as Run) : null;
        if (r && typeof r.run_id === "number") {
          const runFixed: Run = { ...r, events: (Array.isArray(r.events) ? r.events : []).map(toEvent).filter((e): e is PlayEvent => e !== null) };
          setRun(runFixed);
          // A returning visitor lands on their run.
          if (!restored.current) {
            restored.current = true;
            setApp(runFixed.app);
            setStage(3);
          }
        }
      });
      es.addEventListener("step", (m) => {
        const ev = toEvent(parse((m as MessageEvent).data));
        if (!ev) return;
        setRun((r) => {
          if (!r || r.run_id !== ev.run_id) {
            // The first steps of a new run can arrive before the "plant" request has answered: keep them.
            early.current = [...early.current, ev].slice(-40);
            return r;
          }
          return applyStep(r, ev);
        });
      });
      es.addEventListener("error", () => {
        if (!alive || !es) return;
        es.close();
        retry();
      });
    };
    void connect();
    return () => {
      alive = false;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [session]);

  // Gentle cross-fade between steps (GSAP, skipped with reduced motion).
  useEffect(() => {
    const el = panel.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    void import("gsap").then(({ gsap }) => {
      if (dead) return;
      gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", clearProps: "transform" });
      gsap.fromTo(el.querySelectorAll("[data-in]"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.04, delay: 0.08, clearProps: "transform" });
    });
    return () => {
      dead = true;
    };
  }, [stage]);

  const info = apps?.find((a) => a.name === app) ?? null;
  const cases = info?.cases ?? [];
  const working = run?.state === "running";

  const pickApp = (name: string) => {
    setApp(name);
    setBug("surprise");
    setNote(null);
    setStage(2);
    const url = new URL(window.location.href);
    url.searchParams.set("app", name);
    window.history.replaceState(null, "", url);
  };

  const plant = useCallback(async () => {
    if (!session || !app) return;
    setBusy("plant");
    setNote(null);
    setUsed(null);
    early.current = [];
    const r = await post<{ run_id: number }>("/public/playground/run", { session, app, case: bug, exam, heal });
    setBusy(null);
    if (!r.ok || typeof r.data.run_id !== "number") return setNote(r.data.error ?? "The bug could not be planted. Try again.");
    const id = r.data.run_id;
    const start: Run = { run_id: id, app, case_id: bug, events: [], state: "running", approvable: false, heal, scorecard: null };
    setRun(early.current.filter((e) => e.run_id === id).reduce(applyStep, start));
    early.current = [];
    restored.current = true;
    setStage(3);
  }, [session, app, bug, exam, heal]);

  const act = async (kind: "use" | "approve" | "undo") => {
    if (!session || !run) return;
    setBusy(kind);
    setNote(null);
    const r = await post<UseResult>(`/public/playground/${kind}`, { session, run_id: run.run_id });
    setBusy(null);
    if (!r.ok) return setNote(r.data.error ?? "That did not work. Try again.");
    if (kind === "use") setUsed(r.data);
    else setUsed(null);
  };

  const by = useMemo(() => {
    const m: Partial<Record<PlayEvent["step"], PlayEvent>> = {};
    for (const e of run?.events ?? []) m[e.step] = e;
    return m;
  }, [run]);

  const runCaseId = (by.plant?.data.case_id as string | undefined) ?? run?.case_id;
  const runApp = run ? apps?.find((a) => a.name === run.app) : undefined;
  const bugInfo: BugCase | undefined = runApp?.cases.find((c) => c.id === runCaseId);
  const lastSaid = run ? [...run.events].reverse().find((e) => e.step !== "done") : undefined;
  const sentence = stage === 1 ? "Pick one of seven live apps we built and run." : stage === 2 ? "Pick the bug to plant, or let us surprise you." : run ? narrate(lastSaid, run.app) : "";
  const card = run?.scorecard ?? null;
  const fixed = run?.state === "fixed";

  // The app frame: red when it is crashing, green once the fix is in and it answered.
  const fresh = used && used.fixed === fixed ? used : null;
  const crash = by.crash?.data;
  const look: "idle" | "bad" | "good" | "ready" = fresh ? (fresh.answered ? "good" : "bad") : fixed ? "ready" : crash ? "bad" : "idle";

  useEffect(() => {
    const el = frame.current;
    if (!el || look === "idle" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void import("gsap").then(({ gsap }) => gsap.fromTo(el, { scale: 0.985 }, { scale: 1, duration: 0.45, ease: "power2.out", clearProps: "transform" }));
  }, [look]);

  // JaagteRaho's five steps.
  const gate = by.gate?.data;
  const own = by.own_test?.data;
  const ready = by.ready?.data;
  const hidden = run && fixed ? by.hidden_test?.data : undefined;
  const reviewer = isObj(gate?.reviewer) ? (gate.reviewer as { fix_quality?: string }) : null;
  const ticks = [
    { name: "Code rules", ok: gate ? gate.code_rules === "passed" : null },
    { name: "AI review", ok: gate ? (reviewer ? Number(reviewer.fix_quality) >= 2 : false) : null },
    { name: "Own test", ok: own ? own.verdict === "proved" : null },
  ];
  const canApprove = !!run && run.state === "broken" && run.approvable && !!card;
  const cause = by.cause?.data;
  const decision = by.decision?.data;
  const steps = [
    {
      key: "caught",
      title: "Caught",
      done: !!by.connected,
      t: by.connected?.t,
      body: crash ? <span className="mono">{String(crash.exception_type ?? "Error")}</span> : null,
    },
    {
      key: "decided",
      title: "Decided",
      done: !!decision,
      t: by.decision?.t,
      body: decision ? (
        <>
          <span className={`pg2-chip ${ACTION[String(decision.action)]?.cls ?? "quiet"}`}>{ACTION[String(decision.action)]?.label ?? String(decision.action)}</span>{" "}
          <span className="soft">{String(decision.rule_text ?? "")}</span>
        </>
      ) : null,
    },
    {
      key: "cause",
      title: "Cause found",
      done: !!cause,
      t: by.cause?.t,
      body: cause ? (
        cause.unavailable ? (
          <span className="soft">{String(cause.unavailable)}</span>
        ) : (
          <>
            {String(cause.cause_plain ?? "")} <span className="mono soft">{`${String(cause.file ?? "")}:${String(cause.line ?? "")}`}</span>
          </>
        )
      ) : null,
    },
    {
      key: "checked",
      title: "Fix checked",
      done: !!own || (!!ready && !ready.approvable),
      t: by.own_test?.t ?? by.gate?.t,
      body: gate ? (
        <span className="pg2-ticks">
          {ticks.map((k) => (
            <span key={k.name} className={k.ok === null ? "wait" : k.ok ? "ok" : "no"}>
              {k.ok === null ? "·" : k.ok ? "✓" : "✗"} {k.name}
            </span>
          ))}
        </span>
      ) : null,
    },
    {
      key: "fixed",
      title: "Fixed",
      done: fixed,
      t: by.hidden_test?.t,
      body: fixed ? (
        <span>{by.applied?.data.by === "healed" ? "Healed on its own." : "Applied after you approved it."}</span>
      ) : canApprove && run?.heal === "ask" ? (
        <button type="button" className="btn btn-sm" onClick={() => act("approve")} disabled={busy !== null}>
          {busy === "approve" ? "Applying…" : "Approve fix"}
        </button>
      ) : by.note ? (
        <span className="soft">
          {String(by.note.data.text ?? "")}{" "}
          {canApprove ? (
            <button type="button" className="linkish" onClick={() => act("approve")} disabled={busy !== null}>
              Approve it
            </button>
          ) : null}
        </span>
      ) : ready && !ready.approvable ? (
        <span className="soft">{String(ready.reason ?? "This fix cannot be applied.")}</span>
      ) : by.applied ? (
        <span className="soft">Our hidden test is checking it…</span>
      ) : by.failed ? (
        <span className="soft">{String(by.failed.data.note ?? "This run could not finish.")}</span>
      ) : null,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const hiddenResult = hidden ? String(hidden.result) : null;
  const fixSecs = card?.seconds_to_proved_fix ?? card?.total_seconds ?? null;
  const ended = !!run && !working && (fixed || !run.approvable || !!by.failed);

  const chip1 = info ? `${info.title}` : null;
  const chip2 = info && (stage === 3 || run) ? `${bugInfo?.title ?? (bug === "surprise" ? "Surprise bug" : cases.find((c) => c.id === bug)?.title ?? "")} · ${exam ? "exam time on" : "normal hours"} · ${heal === "ask" ? "ask me first" : "heals on its own"}` : null;

  return (
    <div className="pg2">
      {conn === "reconnecting" || appsDown ? (
        <p className="pg2-reconnect" role="status">
          <span className="pg2-pulse" aria-hidden="true" /> Reconnecting to the live server… everything here stays as it was.
        </p>
      ) : null}

      <nav className="pg2-steps" aria-label="Playground steps">
        <ol>
          {(
            [
              [1, "Pick an app", chip1],
              [2, "Pick a bug", stage === 3 ? chip2 : null],
              [3, "Watch it fix", null],
            ] as Array<[Stage, string, string | null]>
          ).map(([n, label, chip]) => {
            const reachable = n === 1 || (n === 2 && !!info) || (n === 3 && !!run);
            return (
              <li key={n} className={n === stage ? "on" : n < stage ? "past" : ""}>
                <button type="button" onClick={() => reachable && setStage(n)} disabled={!reachable} aria-current={n === stage ? "step" : undefined}>
                  <span className="pg2-n" aria-hidden="true">
                    {n < stage ? "✓" : n}
                  </span>
                  <span className="pg2-label">{label}</span>
                  {chip && n < stage ? <span className="pg2-sum">{chip}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <p className="pg2-now">{sentence}</p>
      {/* Screen readers hear each new sentence; the visible line above is the same. */}
      <p className="sr-only" aria-live="polite">
        {sentence}
      </p>

      <div className="pg2-panel" ref={panel} key={stage}>
        {stage === 1 ? (
          <ul className="pg2-apps" aria-label="Live apps">
            {apps === null
              ? Array.from({ length: 7 }, (_, i) => <li key={i} className="pg2-app skeleton" aria-hidden="true" />)
              : apps.map((a) => (
                  <li key={a.name} data-in>
                    <button type="button" className="pg2-app" aria-pressed={a.name === app} onClick={() => pickApp(a.name)}>
                      <span className="pg2-app-name">{a.title}</span>
                      <span className="pg2-app-line">{a.tagline}</span>
                      <span className="pg2-badge">{a.stack}</span>
                    </button>
                  </li>
                ))}
          </ul>
        ) : null}

        {stage === 2 && info ? (
          <div className="pg2-choose">
            <fieldset className="pg2-bugs">
              <legend className="sr-only">Bug to plant in {info.title}</legend>
              <label className={`pg2-bug surprise ${bug === "surprise" ? "on" : ""}`} data-in>
                <input type="radio" name="bug" value="surprise" checked={bug === "surprise"} onChange={() => setBug("surprise")} />
                <b>Surprise me</b>
                <small>One of {cases.length} at random</small>
              </label>
              {cases.map((c) => (
                <label key={c.id} className={`pg2-bug ${bug === c.id ? "on" : ""}`} title={c.symptom} data-in>
                  <input type="radio" name="bug" value={c.id} checked={bug === c.id} onChange={() => setBug(c.id)} />
                  <b>{c.title}</b>
                  <small>{c.symptom}</small>
                </label>
              ))}
            </fieldset>
            <div className="pg2-side" data-in>
              <div className="pg2-opt">
                <button type="button" role="switch" aria-checked={exam} className="pg2-switch" onClick={() => setExam((v) => !v)} aria-labelledby="pg2-exam-l">
                  <i aria-hidden="true" />
                </button>
                <span>
                  <b id="pg2-exam-l">Exam time / peak hour</b>
                  <small>A critical failure then wakes the owner.</small>
                </span>
              </div>
              <div className="pg2-opt">
                <div className="pg2-seg" role="radiogroup" aria-label="When a fix is ready">
                  <button type="button" role="radio" aria-checked={heal === "ask"} onClick={() => setHeal("ask")}>
                    Ask me first
                  </button>
                  <button type="button" role="radio" aria-checked={heal === "auto"} onClick={() => setHeal("auto")}>
                    On its own
                  </button>
                </div>
                <small>On its own: only a fix its own test proved.</small>
              </div>
              <button type="button" className="btn btn-lg pg2-go" onClick={plant} disabled={!session || busy === "plant" || working}>
                {working ? "Still fixing your last bug…" : busy === "plant" ? "Planting…" : "Plant the bug"} <span className="arrow" aria-hidden="true">→</span>
              </button>
              {note ? (
                <p className="pg2-note" role="alert">
                  {note}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {stage === 3 && run ? (
          <div className="pg2-stage">
            <div className="pg2-grid">
              <section className="pg2-left" aria-label={`${appTitle(run.app)}, your copy`} data-in>
                <div className={`pg2-frame ${look}`} ref={frame}>
                  <div className="pg2-frame-bar">
                    <span className="pg2-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="pg2-url">
                      {run.app}.app{bugInfo?.route ?? ""}
                    </span>
                  </div>
                  <div className="pg2-frame-body">
                    <p className="pg2-frame-name">{appTitle(run.app)}</p>
                    <p className="pg2-frame-tag">{runApp?.tagline ?? ""}</p>
                    <span className="pg2-sk" aria-hidden="true" />
                    <span className="pg2-sk short" aria-hidden="true" />
                    <button type="button" className="btn pg2-action" onClick={() => act("use")} disabled={busy !== null || working}>
                      {busy === "use" ? "Sending…" : (bugInfo?.action ?? "Use the app")}
                    </button>
                    <div className="pg2-out" aria-live="off">
                      {look === "bad" ? (
                        <div className="pg2-err">
                          <b>500 · Something went wrong</b>
                          <span className="mono">{fresh?.error ?? `${String(crash?.exception_type ?? "Error")}: ${String(crash?.message ?? "")}`}</span>
                        </div>
                      ) : look === "good" && fresh ? (
                        <div className="pg2-ok">
                          <b>It works</b>
                          <span>{friendly(fresh.response)}</span>
                        </div>
                      ) : look === "ready" ? (
                        <div className="pg2-ok soft-ok">
                          <b>The fix is in</b>
                          <span>Press the button to try it.</span>
                        </div>
                      ) : (
                        <span className="soft small">{working ? "Starting your copy…" : "Press the button to use it."}</span>
                      )}
                      {fresh && (fresh.traceback || fresh.response) ? (
                        <details className="pg2-mini">
                          <summary>Details</summary>
                          <pre>{fresh.traceback ?? JSON.stringify(fresh.response, null, 2)}</pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
                <p className={`pg2-conn ${conn === "live" ? "on" : ""}`}>
                  <i aria-hidden="true" /> {conn === "live" ? "Your own copy · watched live by JaagteRaho" : "Reconnecting…"}
                </p>
              </section>

              <section className="pg2-right" aria-label="What JaagteRaho does" data-in>
                <ol className="pg2-flow">
                  {steps.map((s, i) => (
                    <li key={s.key} className={s.done ? "done" : i === current && working ? "now" : i === current ? "next" : "wait"}>
                      <span className="pg2-ico">
                        <Icon d={ICONS[s.key as keyof typeof ICONS]} />
                      </span>
                      <div className="pg2-step">
                        <p className="pg2-step-h">
                          <b>{s.title}</b>
                          <span className="pg2-t">{secs(s.t)}</span>
                        </p>
                        {s.body ? <div className="pg2-step-b">{s.body}</div> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {note ? (
              <p className="pg2-note" role="alert">
                {note}
              </p>
            ) : null}

            {ended || by.undone ? (
              <div className="pg2-result" data-in>
                <div>
                  {fixed ? (
                    <p className="pg2-big">
                      Fixed <span className="soft">·</span> fix ready in {fixSecs ?? "–"} s <span className="soft">·</span> {card ? rupees(card.cost_usd) : ""}
                    </p>
                  ) : (
                    <p className="pg2-big muted">{by.undone && run.state === "broken" ? "Undone. The bug is back." : "Not fixed this time."}</p>
                  )}
                  {hiddenResult ? (
                    <span className={`pg2-hidden ${hiddenResult}`}>
                      {hiddenResult === "passed" ? "✓ Our hidden test passed" : hiddenResult === "failed" ? "✗ Our hidden test failed" : "Hidden test not run"}
                    </span>
                  ) : card ? (
                    <span className="pg2-hidden">Cost so far {rupees(card.cost_usd)}</span>
                  ) : null}
                </div>
                <div className="pg2-result-actions">
                  {fixed ? (
                    <button type="button" className="btn btn-ghost" onClick={() => act("undo")} disabled={busy !== null}>
                      {busy === "undo" ? "Undoing…" : "Undo"}
                    </button>
                  ) : canApprove ? (
                    <button type="button" className="btn btn-ghost" onClick={() => act("approve")} disabled={busy !== null}>
                      {busy === "approve" ? "Applying…" : "Apply the fix again"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setUsed(null);
                      setStage(2);
                    }}
                  >
                    Try another bug
                  </button>
                </div>
              </div>
            ) : null}

            <details className="pg2-drawer">
              <summary>Show details</summary>
              <div className="pg2-drawer-body">
                {bugInfo || card ? <p className="small">What we planted: {card?.planted?.story ?? bugInfo?.symptom ?? ""}</p> : null}
                {crash ? (
                  <>
                    <h4>Crash</h4>
                    <pre className="pg2-log">
                      {String(crash.route ?? "")} → 500{"\n"}
                      {String(crash.traceback ?? "")}
                    </pre>
                  </>
                ) : null}
                {decision ? (
                  <p className="small">
                    Decision: rule {String(decision.rule)}, {String(decision.rule_text)}. Exam time: {decision.exam_window ? "on" : "off"}.{" "}
                    {decision.critical ? `Critical flow: ${String(decision.critical)}.` : "Not a critical flow."} {decision.sandbox_note ? String(decision.sandbox_note) : ""}
                  </p>
                ) : null}
                {cause && !cause.unavailable ? (
                  <p className="small">
                    Cause, technically: {String(cause.cause_technical ?? "")} ({String(cause.confidence ?? "")})
                  </p>
                ) : null}
                {gate ? (
                  <>
                    <h4>The fix</h4>
                    {gate.diff ? <Diff text={String(gate.diff)} /> : <p className="small soft">No edit proposed.</p>}
                    <p className="small">
                      Code rules: {String(gate.code_rules)}
                      {Array.isArray(gate.code_rule_reasons) && gate.code_rule_reasons.length ? ` (${gate.code_rule_reasons.map(String).join("; ")})` : ""}. AI reviewer:{" "}
                      {reviewer ? `rated ${String(reviewer.fix_quality)} of 3` : "not asked"}. Gate: {String(gate.level)}
                      {Array.isArray(gate.reasons) && gate.reasons.length ? ` (${gate.reasons.map(String).join("; ")})` : ""}.
                    </p>
                  </>
                ) : null}
                {own?.note ? <p className="small">Its own test: {String(own.note)}</p> : null}
                {hidden?.note ? <p className="small">Our hidden test: {String(hidden.note)}</p> : null}
                {runApp ? (
                  <>
                    <h4>The app&apos;s files ({runApp.files})</h4>
                    <ul className="pg2-tree">
                      {runApp.tree.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {card ? (
                  <p className="small soft">
                    {card.case_source === "benchmark" ? "One of the published JR-Bench cases." : "A playground case, not counted in the published JR-Bench numbers."} Cost{" "}
                    {rupees(card.cost_usd)} (${card.cost_usd.toFixed(4)}).
                  </p>
                ) : null}
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
