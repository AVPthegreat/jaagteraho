/* Shapes and helpers shared by the Live playground page and the home page's live strip. */

export type BugCase = { id: string; title: string; symptom: string; action: string; route: string | null; source: "benchmark" | "playground" };

export type AppInfo = {
  cases: BugCase[];
  name: string;
  title: string;
  tagline: string;
  stack: string;
  files: number;
  tree: string[];
  bugs: number;
  critical: string[];
  watching: number;
  running: boolean;
};

export type Scorecard = {
  run_id: number;
  app: string;
  case_id: string;
  case_source: "benchmark" | "playground";
  planted: { story: string; files: string[] };
  error: string;
  where: string | null;
  route: string | null;
  decision: string;
  decision_rule: string;
  cause_plain: string | null;
  named: string | null;
  right_file: boolean | null;
  gate: string;
  gate_reasons: string[];
  own_test: "proved" | "not_proved" | "skipped";
  hidden_test: "passed" | "failed" | "not_run";
  seconds_to_cause: number | null;
  seconds_to_proved_fix: number | null;
  total_seconds: number;
  cost_usd: number;
  finished_at: string;
  applied_by?: "approved" | "healed";
};

export type Step =
  | "plant"
  | "crash"
  | "connected"
  | "decision"
  | "cause"
  | "gate"
  | "own_test"
  | "hidden_test"
  | "done"
  | "failed"
  | "replay"
  | "ready"
  | "note"
  | "applied"
  | "undone"
  | "used_ok"
  | "used_crash";
export type PlayEvent = {
  step: Step;
  app: string;
  run_id: number;
  at: string;
  t: number;
  data: Record<string, unknown>;
  replay_of?: { run_id: number; app: string; at: string };
};

export const TITLES: Record<string, string> = {
  campuskart: "CampusKart",
  clinicq: "ClinicQ",
  examhall: "ExamHall",
  fleetwise: "Fleetwise",
  ledgerly: "Ledgerly",
  messmenu: "MessMenu",
  tiffinbox: "TiffinBox",
};

export const appTitle = (name: string) => TITLES[name] ?? name;
export const baseName = (path: string | null) => (path ? path.split("/").pop() ?? path : "");

export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** What happened, in the strip's words, never more than the run showed. */
export function outcome(c: Scorecard): string {
  if (c.hidden_test === "passed" && c.own_test === "proved" && c.seconds_to_proved_fix !== null) return `fixed and proved in ${c.seconds_to_proved_fix} s`;
  if (c.hidden_test === "passed") return `fixed in ${c.total_seconds} s, our hidden test passed`;
  if (c.seconds_to_cause !== null) return `cause found in ${c.seconds_to_cause} s, fix not proved`;
  return "no diagnosis";
}

export const money = (usd: number) => `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`;

export function newSession() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "v" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadSession(): string {
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

/*
  The playground keeps its own visitor id, under a versioned key, so state saved by an older version of
  this page (or junk) is never read back: anything that is not exactly the expected shape is replaced.
*/
export const PLAY_KEY = "jr_pg2_session";
const PLAY_RE = /^v[0-9a-f]{24}$/;

export function loadPlaySession(): string {
  try {
    const s = localStorage.getItem(PLAY_KEY);
    if (s && PLAY_RE.test(s)) return s;
    const fresh = newSession();
    localStorage.setItem(PLAY_KEY, fresh);
    return fresh;
  } catch {
    return newSession();
  }
}

/** Forgets the playground's saved id (used when the page has to start over after an error). */
export function resetPlaySession() {
  try {
    localStorage.removeItem(PLAY_KEY);
  } catch {
    // nothing stored
  }
}
