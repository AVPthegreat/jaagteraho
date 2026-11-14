"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, appTitle, baseName, money, outcome, type PlayEvent, type Scorecard } from "../playground/play";
import { WATCHER } from "../watcher";

/*
  A slim LIVE line near the top of the home page: the playground's latest real run, updated as runs finish,
  so a visitor understands what JaagteRaho does in ten seconds without a video.
*/
export function LiveStrip() {
  const [runs, setRuns] = useState<Scorecard[] | null>(null);
  const [planting, setPlanting] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch(`${WATCHER}/public/playground/latest?n=5`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { runs: Scorecard[] } | null) => alive && setRuns(d?.runs ?? []))
      .catch(() => alive && setRuns([]));
    const es = new EventSource(`${WATCHER}/public/playground/stream`);
    es.addEventListener("plant", (m) => {
      const ev = JSON.parse((m as MessageEvent).data) as PlayEvent;
      if (!ev.replay_of) setPlanting(ev.app);
    });
    es.addEventListener("done", (m) => {
      const ev = JSON.parse((m as MessageEvent).data) as PlayEvent;
      if (ev.replay_of) return;
      setPlanting(null);
      setRuns((xs) => [ev.data.scorecard as Scorecard, ...(xs ?? [])].slice(0, 5));
    });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      es.close();
      clearInterval(t);
    };
  }, []);

  const r = runs?.[0];
  if (!r && !planting) return null;
  return (
    <Link className="live-strip" href={`/playground${r ? `?app=${r.app}` : ""}`} aria-live="polite">
      <span className="live-strip-tag">
        <i aria-hidden="true" /> LIVE
      </span>
      <span className="live-strip-text">
        {planting ? (
          <>A bug was just planted in {appTitle(planting)}. JaagteRaho is on it…</>
        ) : r ? (
          <>
            {ago(r.finished_at, now)} · {appTitle(r.app)} · {r.error.split(":")[0]}
            {r.where ? ` in ${baseName(r.where)}` : ""} → {outcome(r)} · {money(r.cost_usd)}
          </>
        ) : null}
      </span>
      <span className="live-strip-go">
        Watch live <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
