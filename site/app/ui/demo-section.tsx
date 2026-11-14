import { BreakIt } from "../break-it";
import type { Evidence } from "../watcher";

const secs = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v} s`);

/* The live demo, shared by the home page and /demo: the portal's buttons, the visitor's own logbook, and what to expect. */
export function DemoSection({ ev, country, headingId, level = 2 }: { ev: Evidence | null; country: string | null; headingId: string; level?: 1 | 2 }) {
  const at = (v: number | null | undefined) => (secs(v) ? ` · median ${secs(v)}` : "");
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className="demo-shell">
      <div className="demo-head">
        <p className="eyebrow live" data-rv>
          <i aria-hidden="true" /> Live · no sign-up · nothing pre-recorded
        </p>
        <H id={headingId} className={level === 1 ? "display" : "h-section"} data-rv style={{ "--d": 1 } as React.CSSProperties}>
          Break our exam portal. <em>Watch the watchman work.</em>
        </H>
        <p className="lead" data-rv style={{ "--d": 2 } as React.CSSProperties}>
          A real Django exam portal we run so you can break it. Each button triggers one bug we planted. The crash reaches JaagteRaho exactly as one
          from your app would, and your logbook fills in live, with a timer.
        </p>
        {ev && ev.runs > 0 && (
          <p className="small soft" data-rv style={{ "--d": 3 } as React.CSSProperties}>
            Tried {ev.runs} {ev.runs === 1 ? "time" : "times"} by {ev.people} {ev.people === 1 ? "person" : "people"} so far, counted live by the watcher.
          </p>
        )}
      </div>
      <BreakIt
        country={country}
        see={
          <ol className="see" aria-label="What you will see">
            <li>
              <b>Error</b>
              <span>the real Python error and its page</span>
            </li>
            <li>
              <b>Decision</b>
              <span>wake or message, and the rule{at(ev?.median_seconds.alert)}</span>
            </li>
            <li>
              <b>Wake-up</b>
              <span>the owner&rsquo;s voice note; press play</span>
            </li>
            <li>
              <b>Cause</b>
              <span>plain words, file and line{at(ev?.median_seconds.cause)}</span>
            </li>
            <li>
              <b>Fix</b>
              <span>
                checked{at(ev?.median_seconds.fix)}; then it heals, or waits for your Approve
              </span>
            </li>
          </ol>
        }
      />
    </div>
  );
}
