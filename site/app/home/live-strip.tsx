"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getJson, isObj, liveFeed, retry } from "../live";
import { appTitle, baseName, outcome, type Scorecard } from "../playground/play";
import { safeAgo as ago, safeMoney as money, toEvent, toScorecard } from "./live-data";
import { QuietBoundary } from "../ui/quiet-boundary";
import { WATCHER } from "../watcher";

/*
  A slim LIVE line near the top of the home page: the playground's latest real run, updated as runs finish,
  so a visitor understands what JaagteRaho does in ten seconds without a video.
*/
export function LiveStrip() {
  return (
    <QuietBoundary>
      <LiveStripInner />
    </QuietBoundary>
  );
}

function LiveStripInner() {
  const [runs, setRuns] = useState<Scorecard[] | null>(null);
  const [planting, setPlanting] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    // The live server may be restarting: keep the last runs on screen, retry quietly, never throw.
    const cancel = retry(
      async () => {
        const d = await getJson(`${WATCHER}/public/playground/latest?n=5`, {}, 6000);
        return isObj(d) && Array.isArray(d.runs) ? d.runs.map(toScorecard).filter((c): c is Scorecard => c !== null) : null;
      },
      (list) => alive && setRuns((xs) => (list.length || !xs ? list : xs)),
    );
    const stop = liveFeed(`${WATCHER}/public/playground/stream`, {
      plant: (d) => {
        const ev = toEvent(d);
        if (ev && !ev.replay_of) setPlanting(ev.app);
      },
      done: (d) => {
        const ev = toEvent(d);
        const card = ev && !ev.replay_of ? toScorecard(ev.data.scorecard) : null;
        if (!card) return;
        setPlanting(null);
        setRuns((xs) => [card, ...(xs ?? [])].slice(0, 5));
      },
    });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      cancel();
      stop();
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
            {ago(r.finished_at, now)} · {appTitle(r.app)} · {String(r.error).split(":")[0]}
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
