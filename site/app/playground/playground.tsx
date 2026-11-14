"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Diff } from "../ui/alert-card";
import { WATCHER } from "../watcher";
import { appTitle, loadSession, money, type AppInfo, type BugCase, type PlayEvent, type Scorecard } from "./play";

/*
  The Live playground. The visitor plays: picks an app and the bug to plant (or "Surprise me"), sets the
  time of day and their heal rule, then uses the app before and after the fix, approves it or lets it heal,
  and can undo it. Everything runs for real, in our isolated runner, on the visitor's own copy of the app.
*/

type Run = { run_id: number; app: string; case_id: string; events: PlayEvent[]; state: "running" | "broken" | "fixed"; approvable: boolean; heal: "ask" | "auto"; scorecard: Scorecard | null };
type UseResult = { fixed: boolean; answered: boolean; response: unknown; error: string | null; traceback: string | null };
type Conn = "connecting" | "live" | "reconnecting";

/** Adds one live step to the visitor's run and moves its state along. */
function applyStep(r: Run, ev: PlayEvent): Run {
  const next: Run = { ...r, events: [...r.events, ev] };
  if (ev.step === "ready") next.approvable = Boolean(ev.data.approvable);
  if (ev.step === "done") {
    next.scorecard = ev.data.scorecard as Scorecard;
    if (next.state === "running") next.state = "broken";
  }
  if (ev.step === "failed" || ev.step === "undone") next.state = "broken";
  if (ev.step === "hidden_test" && r.state !== "running") next.state = "fixed";
  return next;
}

const ACTION: Record<string, { label: string; cls: string; say: string }> = {
  wake: { label: "WAKE", cls: "wake", say: "wake the owner now" },
  notify: { label: "NOTIFY", cls: "notify", say: "send the owner a message" },
  log: { label: "LOG", cls: "quiet", say: "log it quietly" },
  ignore: { label: "IGNORE", cls: "quiet", say: "ignore it" },
};

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const r = await fetch(`${WATCHER}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok, data };
  } catch {
    return { ok: false, data: { error: "The live server did not answer. It may be restarting: try again in a few seconds." } as T & { error?: string } };
  }
}

/** One plain sentence for what just happened (the narrator). */
function narrate(ev: PlayEvent | undefined, app: string, bug: BugCase | undefined): string {
  if (!ev) return "Starting…";
  const d = ev.data;
  const name = appTitle(app);
  switch (ev.step) {
    case "plant":
      return `A bug was planted in a fresh copy of ${name}'s code. Starting the app…`;
    case "crash":
      return `${name} just crashed for a real request${bug ? ` (${bug.action.toLowerCase()})` : ""}. Nobody told JaagteRaho.`;
    case "connected":
      return "JaagteRaho caught the error report on its own and is deciding what it deserves.";
    case "decision": {
      const a = ACTION[String(d.action)];
      return `It decided to ${a?.say ?? String(d.action)}, by a written rule: ${String(d.rule_text)}.`;
    }
    case "cause":
      return d.unavailable ? String(d.unavailable) : `It found the cause: ${String(d.cause_plain)}`;
    case "gate":
      return d.level === "recommended" ? "It wrote a small fix; the code rules and an AI reviewer checked it." : `It wrote a fix, but its checks held it back (${String(d.level)}).`;
    case "own_test":
      return d.verdict === "proved"
        ? "Its own test proved the fix: it fails on the broken code and passes with the fix."
        : d.verdict === "not_proved"
          ? "Its own test could not prove the fix."
          : "Its own test was not run for this fix.";
    case "ready":
      if (!d.approvable) return String(d.reason ?? "This fix cannot be applied.");
      return d.heal === "auto" ? "The fix is ready, and your rule lets it heal on its own…" : "The fix is ready. Approve it to put it into your copy of the app.";
    case "note":
      return String(d.text);
    case "applied":
      return d.by === "healed" ? "It healed on its own, as your rule allows. Our hidden test is checking it…" : "You approved the fix. It is in your copy now. Our hidden test is checking it…";
    case "hidden_test":
      return d.result === "passed"
        ? "Our hidden test, which JaagteRaho never saw, passed. Use the app again: it works now."
        : d.result === "failed"
          ? "Our hidden test failed: this fix does not really work. Undo it."
          : "Our hidden test could not run this time.";
    case "done":
      return "The scorecard below has the numbers. Use the app, or approve or undo the fix.";
    case "undone":
      return "You undid the fix. The bug is back: use the app to see it crash again.";
    case "used_crash":
      return "The app crashed for your request, exactly as your users would see it.";
    case "used_ok":
      return "The app answered your request. The bug is gone.";
    case "failed":
      return String(d.note ?? "This run could not finish.");
    default:
      return "";
  }
}

const STEP_LABEL: Partial<Record<PlayEvent["step"], string>> = {
  plant: "Bug planted",
  crash: "App crashed",
  connected: "Error caught",
  decision: "Decision",
  cause: "Cause found",
  gate: "Fix written and checked",
  own_test: "Its own test",
  ready: "Fix ready",
  note: "Note",
  applied: "Fix applied",
  hidden_test: "Our hidden test",
  undone: "Fix undone",
  failed: "Run stopped",
};

function StepDetail({ ev }: { ev: PlayEvent }) {
  const d = ev.data;
  if (ev.step === "crash")
    return (
      <pre className="pg-log">
        {String(d.route ?? "")} → 500{"\n"}
        {String(d.traceback)}
      </pre>
    );
  if (ev.step === "decision")
    return (
      <p className="small">
        <span className={`stamp ${ACTION[String(d.action)]?.cls ?? "quiet"}`}>{ACTION[String(d.action)]?.label ?? String(d.action)}</span> Rule {String(d.rule)}: {String(d.rule_text)}.{" "}
        Exam or peak time: {d.exam_window ? "on" : "off"}. {d.critical ? `Critical flow: ${String(d.critical)}.` : "Not a critical flow."} {d.sandbox_note ? String(d.sandbox_note) : ""}
      </p>
    );
  if (ev.step === "cause" && !d.unavailable)
    return (
      <p className="mono small">
        {String(d.file)}:{String(d.line)} · {String(d.confidence)} · {String(d.cause_technical ?? "")}
      </p>
    );
  if (ev.step === "gate") {
    const why = (d.code_rule_reasons as string[] | undefined) ?? [];
    const reasons = (d.reasons as string[] | undefined) ?? [];
    return (
      <>
        {d.diff ? <Diff text={String(d.diff)} /> : <p className="small soft">No edit proposed.</p>}
        <p className="small">
          Code rules: {String(d.code_rules)}
          {why.length ? ` (${why.join("; ")})` : ""}. AI reviewer: {d.reviewer ? `rated ${(d.reviewer as { fix_quality: string }).fix_quality} of 3` : "not asked"}. Gate:{" "}
          {String(d.level)}
          {reasons.length ? ` (${reasons.join("; ")})` : ""}.
        </p>
      </>
    );
  }
  if ((ev.step === "own_test" || ev.step === "hidden_test") && d.note) return <p className="small">{String(d.note)}</p>;
  return <p className="small soft">Nothing more to show for this step.</p>;
}

export function Playground() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [appsDown, setAppsDown] = useState(false);
  const [app, setApp] = useState<string | null>(null);
  const [bug, setBug] = useState<string>("surprise");
  const [exam, setExam] = useState(false);
  const [heal, setHeal] = useState<"ask" | "auto">("ask");
  const [session, setSession] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "plant" | "use" | "approve" | "undo">(null);
  const [used, setUsed] = useState<UseResult | null>(null);
  const [last, setLast] = useState<Scorecard | null>(null);
  const workRef = useRef<HTMLDivElement | null>(null);
  const early = useRef<PlayEvent[]>([]);

  // The list of apps, retried with backoff while the live server restarts.
  useEffect(() => {
    setSession(loadSession());
    const fromUrl = new URLSearchParams(window.location.search).get("app");
    if (fromUrl && /^[a-z]{2,20}$/.test(fromUrl)) setApp(fromUrl);
    let alive = true;
    let wait = 1000;
    const load = () =>
      fetch(`${WATCHER}/public/playground/apps`, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { apps: AppInfo[] }) => {
          if (!alive) return;
          setApps(d.apps);
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

  // The visitor's own feed. EventSource gives up when a reconnect fails, so we reconnect ourselves with
  // backoff and keep everything on screen; the snapshot on reconnect resumes the run where it was.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    let es: EventSource | null = null;
    let wait = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (!alive) return;
      es = new EventSource(`${WATCHER}/public/playground/mine/${session}`);
      es.addEventListener("snapshot", (m) => {
        wait = 1000;
        setConn("live");
        const s = JSON.parse((m as MessageEvent).data) as { run: Run | null };
        if (s.run) setRun(s.run);
      });
      es.addEventListener("step", (m) => {
        const ev = JSON.parse((m as MessageEvent).data) as PlayEvent;
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
        setConn("reconnecting");
        if (es.readyState !== EventSource.CLOSED) return; // the browser is retrying by itself
        es.close();
        timer = setTimeout(connect, wait);
        wait = Math.min(wait * 2, 30_000);
      });
    };
    connect();
    return () => {
      alive = false;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [session]);

  const info = apps?.find((a) => a.name === app) ?? null;
  const cases = info?.cases ?? [];

  useEffect(() => {
    if (!app) return;
    let alive = true;
    fetch(`${WATCHER}/public/playground/latest?n=20`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { runs: Scorecard[] } | null) => alive && setLast(d?.runs.find((x) => x.app === app) ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [app]);

  const pickApp = (name: string) => {
    setApp(name);
    setBug("surprise");
    setNote(null);
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
    if (!r.ok) return setNote(r.data.error ?? "The bug could not be planted. Try again.");
    const id = r.data.run_id;
    const start: Run = { run_id: id, app, case_id: bug, events: [], state: "running", approvable: false, heal, scorecard: null };
    setRun(early.current.filter((e) => e.run_id === id).reduce(applyStep, start));
    early.current = [];
    requestAnimationFrame(() => workRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [session, app, bug, exam, heal]);

  const act = async (kind: "use" | "approve" | "undo") => {
    if (!session || !run) return;
    setBusy(kind);
    setNote(null);
    const r = await post<UseResult>(`/public/playground/${kind}`, { session, run_id: run.run_id });
    setBusy(null);
    if (!r.ok) return setNote(r.data.error ?? "That did not work. Try again.");
    if (kind === "use") setUsed(r.data);
  };

  // The real case once the server picked one for "Surprise me".
  const runCaseId = (run?.events.find((e) => e.step === "plant")?.data.case_id as string | undefined) ?? run?.case_id;
  const bugInfo = run ? apps?.find((a) => a.name === run.app)?.cases.find((c) => c.id === runCaseId) : undefined;
  const sentence = run ? narrate(run.events.at(-1), run.app, bugInfo) : "";
  const timeline = useMemo(() => (run?.events ?? []).filter((e) => STEP_LABEL[e.step]), [run]);
  const card = run?.scorecard ?? null;
  const working = run?.state === "running";
  const ready = run?.state === "broken" && run.approvable && !!card;

  return (
    <div className="pg">
      {conn === "reconnecting" || appsDown ? (
        <p className="pg-reconnect">
          <span className="pg-pulse" aria-hidden="true" /> Reconnecting to the live server… Everything here stays as it was.
        </p>
      ) : null}

      <h2 className="pg-step-h">
        <span aria-hidden="true">1</span> Pick a live app
      </h2>
      <ul className="pg-apps" aria-label="Live apps">
        {apps === null
          ? Array.from({ length: 7 }, (_, i) => <li key={i} className="pg-app skeleton" aria-hidden="true" />)
          : apps.map((a) => (
              <li key={a.name}>
                <button type="button" className="pg-app" aria-pressed={a.name === app} onClick={() => pickApp(a.name)}>
                  <span className="pg-app-top">
                    <b>{a.title}</b>
                    <span className="pg-stack">{a.stack}</span>
                  </span>
                  <span className="pg-app-line">{a.tagline}</span>
                  <span className="pg-app-meta">
                    {a.files} files · {a.cases.length} bugs to choose from
                  </span>
                </button>
              </li>
            ))}
      </ul>

      {info ? (
        <section className="pg-choose" aria-labelledby="pg-choose-h">
          <h2 className="pg-step-h" id="pg-choose-h">
            <span aria-hidden="true">2</span> Pick the bug to plant in {info.title}
          </h2>
          <fieldset className="pg-bugs">
            <legend className="sr-only">Bug to plant</legend>
            <label className={`pg-bug ${bug === "surprise" ? "on" : ""}`}>
              <input type="radio" name="bug" value="surprise" checked={bug === "surprise"} onChange={() => setBug("surprise")} />
              <span>
                <b>Surprise me</b>
                <small>We pick one of the {cases.length} bugs at random.</small>
              </span>
            </label>
            {cases.map((c) => (
              <label key={c.id} className={`pg-bug ${bug === c.id ? "on" : ""}`}>
                <input type="radio" name="bug" value={c.id} checked={bug === c.id} onChange={() => setBug(c.id)} />
                <span>
                  <b>{c.title}</b>
                  <small>{c.symptom}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="pg-switches">
            <label className="pg-switch">
              <input type="checkbox" checked={exam} onChange={(e) => setExam(e.target.checked)} />
              <span>
                <b>It&apos;s exam time / peak hour</b>
                <small>
                  {info.critical.length
                    ? `A failure in a critical flow (${info.critical.join(", ")}) then wakes the owner instead of sending a message.`
                    : "This app has no critical flow marked, so the decision will not change."}
                </small>
              </span>
            </label>
            <fieldset className="pg-heal">
              <legend>Your heal rule</legend>
              <label>
                <input type="radio" name="heal" checked={heal === "ask"} onChange={() => setHeal("ask")} /> Ask me first
              </label>
              <label>
                <input type="radio" name="heal" checked={heal === "auto"} onChange={() => setHeal("auto")} /> Heal on its own (only a fix its own test proved)
              </label>
            </fieldset>
          </div>
          <p className="pg-plant-row">
            <button type="button" className="btn btn-lg" onClick={plant} disabled={!session || busy === "plant" || working}>
              {working ? "JaagteRaho is on your last bug…" : busy === "plant" ? "Planting…" : "Plant this bug"} <span className="arrow" aria-hidden="true">→</span>
            </button>
          </p>
          {note ? (
            <p className="pg-note" role="alert">
              {note}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="pg-pick soft">Pick an app to see its bugs.</p>
      )}

      {run ? (
        <div className="pg-work" ref={workRef}>
          <h2 className="pg-step-h">
            <span aria-hidden="true">3</span> Play: use the app, approve the fix, undo it
          </h2>
          <div className="pg-now">
            <span className="pg-now-tag">What&apos;s happening now</span>
            <p>{sentence}</p>
          </div>
          {/* Screen readers hear each new sentence; this copy is visually hidden. */}
          <p className="sr-only" aria-live="polite">
            {sentence}
          </p>
          <div className="pg-grid">
            <section className="pg-use" aria-label="Use the app">
              <div className="pg-bar">
                <b>{appTitle(run.app)}</b>
                <span className={`pg-conn ${conn === "live" ? "on" : ""}`}>
                  <i aria-hidden="true" /> {conn === "live" ? "Connected to JaagteRaho · live" : "Reconnecting…"}
                </span>
              </div>
              <div className="pg-use-body">
                <p className="small soft">
                  Your own copy of the app, running in our isolated sandbox.{" "}
                  {run.state === "fixed" ? <b className="pg-ok">The fix is in.</b> : run.state === "broken" ? <b className="pg-bad">The bug is in.</b> : "Starting…"}
                </p>
                <button type="button" className="btn pg-use-btn" onClick={() => act("use")} disabled={busy !== null || working}>
                  {busy === "use" ? "Sending…" : (bugInfo?.action ?? "Use the app")}
                  {bugInfo?.route ? <code>{bugInfo.route}</code> : null}
                </button>
                {used ? (
                  <div className={`pg-resp ${used.answered ? "ok" : "bad"}`}>
                    <p className="pg-resp-head">
                      <span className="pg-status">{used.answered ? "Answered" : "500 · crashed"}</span> {used.fixed ? "with the fix" : "with the bug"}
                    </p>
                    {used.answered ? (
                      <pre>{used.response ? JSON.stringify(used.response, null, 2) : "It ran without an error."}</pre>
                    ) : (
                      <>
                        <p className="mono small">{used.error}</p>
                        {used.traceback ? (
                          <details>
                            <summary>Traceback</summary>
                            <pre className="pg-log">{used.traceback}</pre>
                          </details>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="small soft">{working ? "When the crash is caught, try it yourself." : "Press it to send the request yourself."}</p>
                )}
                <div className="pg-actions">
                  {ready ? (
                    <button type="button" className="btn" onClick={() => act("approve")} disabled={busy !== null}>
                      {busy === "approve" ? "Applying…" : run.heal === "auto" ? "Approve it myself" : "Approve fix"}
                    </button>
                  ) : null}
                  {run.state === "fixed" ? (
                    <button type="button" className="btn btn-ghost" onClick={() => act("undo")} disabled={busy !== null}>
                      {busy === "undo" ? "Undoing…" : "Undo fix"}
                    </button>
                  ) : null}
                </div>
                {info && info.name === run.app ? (
                  <details className="pg-files">
                    <summary>The app&apos;s files ({info.files})</summary>
                    <ul className="pg-tree">
                      {info.tree.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </section>

            <section className="pg-jr" aria-label="What JaagteRaho did">
              <h3 className="pg-h">What JaagteRaho did · open a step for details</h3>
              <ol className="pg-timeline">
                {timeline.map((e, i) => (
                  <li key={`${e.step}-${i}`}>
                    <details>
                      <summary>
                        <span className="pg-tl-t">{e.t.toFixed(1)} s</span>
                        <span className="pg-tl-text">
                          <b>{STEP_LABEL[e.step]}</b> {narrate(e, run.app, bugInfo)}
                        </span>
                      </summary>
                      <StepDetail ev={e} />
                    </details>
                  </li>
                ))}
                {working ? (
                  <li className="pg-tl-wait">
                    <span className="pg-pulse" aria-hidden="true" /> Working…
                  </li>
                ) : null}
              </ol>
            </section>
          </div>
          {card ? <Score card={card} /> : null}
        </div>
      ) : last ? (
        <div className="pg-work">
          <p className="small soft">The last real run on {appTitle(last.app)}:</p>
          <Score card={last} />
        </div>
      ) : null}
    </div>
  );
}

function Score({ card }: { card: Scorecard }) {
  return (
    <div className="pg-card">
      <p className="pg-card-head">
        Scorecard · {appTitle(card.app)} · {card.error}
      </p>
      <dl className="pg-nums">
        <div>
          <dt>Seconds to cause</dt>
          <dd>{card.seconds_to_cause ?? "–"}</dd>
        </div>
        <div>
          <dt>Seconds to proved fix</dt>
          <dd>{card.seconds_to_proved_fix ?? "–"}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{money(card.cost_usd)}</dd>
        </div>
        <div>
          <dt>Right file</dt>
          <dd className={card.right_file ? "ok" : "bad"}>{card.right_file === null ? "–" : card.right_file ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt>Hidden test</dt>
          <dd className={card.hidden_test === "passed" ? "ok" : card.hidden_test === "failed" ? "bad" : ""}>{card.hidden_test === "not_run" ? "not run yet" : card.hidden_test}</dd>
        </div>
      </dl>
      <p className="small soft">
        What we planted: {card.planted.story} ({card.planted.files.join(", ")}).
        {card.case_source === "benchmark" ? " One of the published JR-Bench cases." : " A playground case, not counted in the published JR-Bench numbers."}
        {card.applied_by ? (card.applied_by === "healed" ? " It healed on its own under your rule." : " Applied after you approved it.") : ""}
      </p>
    </div>
  );
}
