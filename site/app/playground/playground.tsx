"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Diff } from "../ui/alert-card";
import { WATCHER } from "../watcher";
import { appTitle, loadSession, money, type AppInfo, type PlayEvent, type Scorecard } from "./play";

/*
  The Live playground: pick a live app, it opens, JaagteRaho connects by itself, and a real planted bug
  plays out step by step. The visitor never has to press anything else.
*/

type Snapshot = { app: string; running: boolean; events: PlayEvent[]; last: Scorecard | null; next_at: string | null; every_seconds: number; live: boolean };
type Mark = "pass" | "fail" | "skip" | "wait";

const ACTION: Record<string, { label: string; cls: string; say: string }> = {
  wake: { label: "WAKE", cls: "wake", say: "Wake the owner now" },
  notify: { label: "NOTIFY", cls: "notify", say: "Message the owner" },
  log: { label: "LOG", cls: "quiet", say: "Log it quietly" },
  ignore: { label: "IGNORE", cls: "quiet", say: "Ignore it" },
};

const MARK_TEXT: Record<Mark, string> = { pass: "passed", fail: "failed", skip: "not run", wait: "waiting" };

function CheckRow({ name, mark, note }: { name: string; mark: Mark; note?: string | null }) {
  return (
    <li className={`pg-check ${mark}`}>
      <span className="pg-check-dot" aria-hidden="true">
        {mark === "pass" ? "✓" : mark === "fail" ? "✗" : mark === "skip" ? "–" : "·"}
      </span>
      <span className="pg-check-name">{name}</span>
      <span className="pg-check-state">{MARK_TEXT[mark]}</span>
      {note ? <span className="pg-check-note">{note}</span> : null}
    </li>
  );
}

function clock(s: number) {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

export function Playground() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [app, setApp] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [events, setEvents] = useState<PlayEvent[]>([]);
  const [last, setLast] = useState<Scorecard | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const openRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSession(loadSession());
    const fromUrl = new URLSearchParams(window.location.search).get("app");
    if (fromUrl && /^[a-z]{2,20}$/.test(fromUrl)) setApp(fromUrl);
    fetch(`${WATCHER}/public/playground/apps`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { apps: AppInfo[] }) => setApps(d.apps))
      .catch(() => setLoadError("The playground is not answering right now. Try again in a minute."));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Attach to the chosen app: one "open" call (starts a run at once if none is in flight), the live feed,
  // and a heartbeat so the server keeps planting a bug every minute while this tab watches.
  useEffect(() => {
    if (!app || !session) return;
    let alive = true;
    setEvents([]);
    setLast(null);
    setConnected(false);
    setNote(null);
    const watch = (open: boolean) =>
      fetch(`${WATCHER}/public/playground/watch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, app, open }),
      })
        .then(async (r) => {
          if (!alive) return;
          if (!r.ok) {
            const body = (await r.json().catch(() => ({}))) as { error?: string };
            setNote(body.error ?? "The playground could not attach to this app.");
          }
        })
        .catch(() => alive && setNote("The playground is not answering right now."));
    const es = new EventSource(`${WATCHER}/public/playground/feed/${app}`);
    es.addEventListener("open", () => alive && setConnected(true));
    es.addEventListener("error", () => alive && setConnected(false));
    es.addEventListener("snapshot", (m) => {
      const s = JSON.parse((m as MessageEvent).data) as Snapshot;
      setEvents(s.events);
      setLast(s.last);
      setNextAt(s.next_at ? Date.parse(s.next_at) : null);
      setConnected(true);
      // Ask for a run only once the feed is listening, so the first step is never missed.
      void watch(true);
    });
    es.addEventListener("ping", (m) => {
      const d = JSON.parse((m as MessageEvent).data) as { next_at?: string | null };
      if (d.next_at) setNextAt(Date.parse(d.next_at));
    });
    es.addEventListener("step", (m) => {
      const ev = JSON.parse((m as MessageEvent).data) as PlayEvent;
      if (ev.step === "plant" || ev.step === "replay") {
        setEvents([ev]);
        setNextAt(null);
        return;
      }
      setEvents((xs) => [...xs, ev]);
      if (ev.step === "done") {
        const card = ev.data.scorecard as Scorecard;
        setLast(card);
        const inS = Number(ev.data.next_in_seconds);
        if (!ev.replay_of && Number.isFinite(inS)) setNextAt(Date.now() + Math.max(0, inS) * 1000);
      }
    });
    const beat = setInterval(() => void watch(false), 45_000);
    return () => {
      alive = false;
      clearInterval(beat);
      es.close();
    };
  }, [app, session]);

  const pick = (name: string) => {
    setApp(name);
    const url = new URL(window.location.href);
    url.searchParams.set("app", name);
    window.history.replaceState(null, "", url);
    requestAnimationFrame(() => openRef.current?.focus());
  };

  const by = useMemo(() => {
    const m: Partial<Record<PlayEvent["step"], PlayEvent>> = {};
    for (const e of events) m[e.step] = e;
    return m;
  }, [events]);

  const info = apps?.find((a) => a.name === app) ?? null;
  const crash = by.crash?.data;
  const decision = by.decision?.data;
  const cause = by.cause?.data;
  const gate = by.gate?.data;
  const own = by.own_test?.data;
  const hidden = by.hidden_test?.data;
  const done = by.done?.data.scorecard as Scorecard | undefined;
  const replay = events.find((e) => e.step === "replay") ?? null;
  const running = events.length > 0 && !by.done && !by.failed;
  const where = (crash?.where as string | undefined) ?? null;
  const fixFile = (cause?.file as string | undefined) ?? null;
  const t = (e?: PlayEvent) => (e ? `${e.t.toFixed(1)} s` : "");

  const reviewer = gate?.reviewer as { fix_quality: string } | null | undefined;
  const marks: Array<{ name: string; mark: Mark; note?: string | null }> = [
    { name: "Code rules", mark: !gate ? "wait" : gate.code_rules === "passed" ? "pass" : "fail", note: gate && gate.code_rules !== "passed" ? ((gate.code_rule_reasons as string[]) ?? [])[0] : null },
    {
      name: "AI reviewer",
      mark: !gate ? "wait" : reviewer ? (Number(reviewer.fix_quality) >= 2 ? "pass" : "fail") : "skip",
      note: reviewer ? `rated ${reviewer.fix_quality} of 3` : gate ? "not asked: the code rules stopped it first" : null,
    },
    {
      name: "Its own regression test",
      mark: !own ? "wait" : own.verdict === "proved" ? "pass" : own.verdict === "not_proved" ? "fail" : "skip",
      note: own ? String(own.note ?? "") : null,
    },
    {
      name: "Our hidden test",
      mark: !hidden ? (own?.verdict === "skipped" && !gate?.diff ? "skip" : "wait") : hidden.result === "passed" ? "pass" : hidden.result === "failed" ? "fail" : "skip",
      note: hidden ? (hidden.note ? String(hidden.note) : "Written by us before the run. JaagteRaho never sees it.") : null,
    },
  ];

  const nextIn = nextAt ? (nextAt - now) / 1000 : null;

  return (
    <div className="pg">
      <ul className="pg-apps" aria-label="Live apps">
        {apps === null && !loadError
          ? Array.from({ length: 7 }, (_, i) => <li key={i} className="pg-app skeleton" aria-hidden="true" />)
          : (apps ?? []).map((a) => (
              <li key={a.name}>
                <button type="button" className="pg-app" aria-pressed={a.name === app} onClick={() => pick(a.name)}>
                  <span className="pg-app-top">
                    <b>{a.title}</b>
                    <span className="pg-stack">{a.stack}</span>
                  </span>
                  <span className="pg-app-line">{a.tagline}</span>
                  <span className="pg-app-meta">
                    {a.files} files · {a.bugs} {a.bugs === 1 ? "bug" : "bugs"} to plant
                    {a.running ? <span className="pg-live-dot"> · live run</span> : null}
                  </span>
                </button>
              </li>
            ))}
      </ul>
      {loadError ? (
        <p className="pg-note" role="alert">
          {loadError}
        </p>
      ) : null}

      {app ? (
        <div className="pg-open" ref={openRef} tabIndex={-1} aria-label={`${appTitle(app)}, live`}>
          <div className="pg-bar">
            <span className="pg-bar-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <b>{appTitle(app)}</b>
            <span className="pg-bar-url">{info?.stack ?? ""} · running on our server</span>
            <span className={`pg-conn ${connected ? "on" : ""}`} role="status">
              <i aria-hidden="true" /> {connected ? "Connected to JaagteRaho · live" : "Connecting…"}
            </span>
          </div>

          {replay ? (
            <p className="pg-replay" role="status">
              {String(replay.data.note)}
            </p>
          ) : null}
          {note ? (
            <p className="pg-note" role="alert">
              {note}
            </p>
          ) : null}

          <div className="pg-grid">
            <section className="pg-app-pane" aria-label="The app">
              <h3 className="pg-h">Files</h3>
              <ul className="pg-tree">
                {(info?.tree ?? []).map((f) => {
                  const crashHere = where?.startsWith(`${f}:`);
                  const fixHere = fixFile !== null && (f === fixFile || f.endsWith(`/${fixFile}`));
                  return (
                    <li key={f} className={crashHere ? "crash" : fixHere ? "fix" : ""}>
                      {f}
                      {crashHere ? <em> crashed here</em> : fixHere ? <em> fix goes here</em> : null}
                    </li>
                  );
                })}
              </ul>
              <h3 className="pg-h">Server log</h3>
              <pre className="pg-log" aria-live="polite">
                {by.plant ? `[${t(by.plant)}] a new bug was planted in a fresh copy of the code\n` : ""}
                {crash ? `[${t(by.crash)}] ${crash.route ?? ""} → 500\n${String(crash.traceback)}` : running || by.plant ? "" : "Waiting for the next bug…"}
              </pre>
            </section>

            <section className="pg-jr" aria-label="JaagteRaho" aria-live="polite">
              <ol className="pg-steps">
                <li className={by.connected ? "done" : "wait"}>
                  <span className="pg-step-t">{t(by.connected)}</span>
                  <b>Error caught</b>
                  {crash ? (
                    <p className="mono">
                      {String(crash.exception_type)}: {String(crash.message)}
                      {where ? <> · {where}</> : null}
                    </p>
                  ) : (
                    <p className="soft">Listening for errors.</p>
                  )}
                </li>
                <li className={decision ? "done" : "wait"}>
                  <span className="pg-step-t">{t(by.decision)}</span>
                  <b>Decision</b>
                  {decision ? (
                    <p>
                      <span className={`stamp ${ACTION[String(decision.action)]?.cls ?? "quiet"}`}>{ACTION[String(decision.action)]?.label ?? String(decision.action)}</span>{" "}
                      {ACTION[String(decision.action)]?.say}: rule {String(decision.rule)}, {String(decision.rule_text)}.
                      {decision.sandbox_note ? <span className="soft small"> {String(decision.sandbox_note)}</span> : null}
                    </p>
                  ) : null}
                </li>
                <li className={cause ? "done" : "wait"}>
                  <span className="pg-step-t">{t(by.cause)}</span>
                  <b>Cause</b>
                  {cause ? (
                    cause.unavailable ? (
                      <p className="soft">{String(cause.unavailable)}</p>
                    ) : (
                      <>
                        <p>{String(cause.cause_plain)}</p>
                        <p className="mono small">
                          {String(cause.file)}:{String(cause.line)} · {String(cause.confidence)}
                        </p>
                      </>
                    )
                  ) : null}
                </li>
                <li className={gate ? "done" : "wait"}>
                  <span className="pg-step-t">{t(by.gate)}</span>
                  <b>Fix</b>
                  {gate?.diff ? <Diff text={String(gate.diff)} /> : gate ? <p className="soft">No edit proposed.</p> : null}
                  {gate ? (
                    <p className="small">
                      Gate: <b>{String(gate.level)}</b>
                      {(gate.reasons as string[]).length ? ` (${(gate.reasons as string[]).join("; ")})` : ""}
                    </p>
                  ) : null}
                </li>
              </ol>
              <h3 className="pg-h">Checks</h3>
              <ul className="pg-checks">
                {marks.map((m) => (
                  <CheckRow key={m.name} {...m} />
                ))}
              </ul>
            </section>
          </div>

          <div className="pg-score" aria-live="polite">
            {done ? <Score card={done} replayed={!!replay} /> : last && !running ? <Score card={last} replayed={false} label="Last run" /> : null}
            <p className="pg-next">
              {running ? (
                <>
                  <span className="pg-pulse" aria-hidden="true" /> Working on it live
                </>
              ) : nextIn !== null ? (
                nextIn > 0 ? (
                  <>Next bug in {clock(nextIn)}</>
                ) : (
                  <>Planting the next bug…</>
                )
              ) : (
                <>A new bug is planted every minute while you watch.</>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="pg-pick soft">Pick an app. It opens here and JaagteRaho connects to it by itself.</p>
      )}
    </div>
  );
}

function Score({ card, replayed, label }: { card: Scorecard; replayed: boolean; label?: string }) {
  return (
    <div className="pg-card">
      <p className="pg-card-head">
        {label ?? (replayed ? "Replayed result" : "Result")} · {appTitle(card.app)} · {card.error}
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
          <dd className={card.hidden_test === "passed" ? "ok" : card.hidden_test === "failed" ? "bad" : ""}>{card.hidden_test.replace("_", " ")}</dd>
        </div>
      </dl>
      <p className="small soft">
        What we planted: {card.planted.story} ({card.planted.files.join(", ")}).
        {card.case_source === "benchmark" ? " One of the published JR-Bench cases." : " A playground case, not counted in the published JR-Bench numbers."}
      </p>
    </div>
  );
}
