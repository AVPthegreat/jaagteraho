/*
  Checking the live strip's data as it comes off the wire: the live server may be mid-restart or a
  proxy may answer, so anything that is not a well-formed run or event is dropped, never rendered.
*/
import type { PlayEvent, Scorecard, Step } from "../playground/play";

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A scorecard with every field the strip reads made safe; null if it is not one. */
export function toScorecard(v: unknown): Scorecard | null {
  const o = obj(v);
  if (!o || typeof o.app !== "string") return null;
  const planted = obj(o.planted);
  const own = str(o.own_test, "skipped");
  const hidden = str(o.hidden_test, "not_run");
  return {
    run_id: num(o.run_id) ?? 0,
    app: o.app,
    case_id: str(o.case_id),
    case_source: o.case_source === "benchmark" ? "benchmark" : "playground",
    planted: { story: str(planted?.story, "a planted bug"), files: strs(planted?.files) },
    error: str(o.error, "an error"),
    where: typeof o.where === "string" ? o.where : null,
    route: typeof o.route === "string" ? o.route : null,
    decision: str(o.decision),
    decision_rule: str(o.decision_rule),
    cause_plain: typeof o.cause_plain === "string" ? o.cause_plain : null,
    named: typeof o.named === "string" ? o.named : null,
    right_file: typeof o.right_file === "boolean" ? o.right_file : null,
    gate: str(o.gate),
    gate_reasons: strs(o.gate_reasons),
    own_test: own === "proved" || own === "not_proved" ? own : "skipped",
    hidden_test: hidden === "passed" || hidden === "failed" ? hidden : "not_run",
    seconds_to_cause: num(o.seconds_to_cause),
    seconds_to_proved_fix: num(o.seconds_to_proved_fix),
    total_seconds: num(o.total_seconds) ?? 0,
    cost_usd: num(o.cost_usd) ?? 0,
    finished_at: str(o.finished_at),
  };
}

const STEPS: Step[] = ["plant", "crash", "connected", "decision", "cause", "gate", "own_test", "hidden_test", "done", "failed", "replay"];

/** A playground event, or null if it is not one we know. */
export function toEvent(v: unknown): PlayEvent | null {
  const o = obj(v);
  if (!o || !STEPS.includes(o.step as Step)) return null;
  const rep = obj(o.replay_of);
  return {
    step: o.step as Step,
    app: str(o.app),
    run_id: num(o.run_id) ?? 0,
    at: str(o.at),
    t: num(o.t) ?? 0,
    data: obj(o.data) ?? {},
    replay_of: rep ? { run_id: num(rep.run_id) ?? 0, app: str(rep.app), at: str(rep.at) } : undefined,
  };
}

export const safeMoney = (usd: number) => (Number.isFinite(usd) ? `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}` : "–");

export function safeAgo(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "just now";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
