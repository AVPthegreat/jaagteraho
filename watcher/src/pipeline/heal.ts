// Self-healing under rules the owner sets. By default the owner approves every fix ("ask").
// The owner can instead let a checked fix go in on its own: right away ("auto-now"), or when a
// WAKE alert is not acknowledged within N minutes ("auto-after").
//
// A fix may go in without a person only when ALL of these hold (healBlocker below):
// - the gate marked it "recommended"; on a real app every reviewer vote agreed (quality 3, nothing sensitive,
//   nothing breaks); on the demo portal its own regression test proved it;
// - it touches no protected area (HEAL_PROTECTED: wider than the gate's list) and adds no risky code
//   (imports, processes, network, file writes, dynamic code, decoding, built-up URLs: riskyAdditions);
// - on a real app, every error in the incident carried the app's server-only ingest secret, so nobody
//   holding only the public key (it ships in browsers) can choose the files a fix edits;
// - the app's heal count for the night is under the owner's cap, and self-healing is not paused.
//
// What "apply" means depends on the app:
// - Demo portal (sandbox): no code is written. The visitor's session is switched to the portal's
//   prebuilt fixed build and the failing request is sent again, so the proof is immediate.
// - A real app: only with a write token bound to that app's repository. A pull request is opened and
//   GitHub auto-merge is turned on, but only when the branch requires status checks, so the
//   repository's own checks decide. Otherwise the PR is left for the owner and paging goes on.
//   After the deploy is seen, the error is watched; if it does not drop, the fix is reverted, the
//   owner is woken again and self-healing pauses for 12 hours.

import { randomBytes } from "node:crypto";
import { bus, type FeedEvent } from "../bus.js";
import { getSettings, setSettings, type DB } from "../db/db.js";
import { openFixPullRequest } from "../github/pr.js";
import { dsnFor } from "../projects.js";
import { esc, type Markup, type Telegram } from "../telegram/api.js";
import { HEAL_PROTECTED, riskyAdditions } from "./gate.js";

export type HealMode = "off" | "ask" | "auto-after" | "auto-now";
export type HealPolicy = {
  mode: HealMode;
  after_min: number; // auto-after: minutes a WAKE may stay unacknowledged
  max_per_night: number; // heals per app in any 12 hours
  flows: string[]; // auto-now: only these route prefixes ([] = any route)
  suspended_until?: string | null; // set after a heal that did not help
  suspended_reason?: string | null;
};
export type HealTrigger = "auto-now" | "auto-after" | "owner";
export type HealStatus =
  | "skipped" // not applied: a rule said no (reason in detail)
  | "diff_sent" // no write access: the diff went to the owner, paging goes on
  | "pr_open" // PR opened but not set to merge by itself: the owner merges
  | "merging" // PR opened with auto-merge on: waits for the repository's required checks
  | "applied" // merged; waiting for the deploy, then watching the error
  | "verified" // errors stopped after the deploy: confirmed
  | "unconfirmed" // merged, but no deploy was seen within a day
  | "undoing" // an undo is in progress (claimed, so it runs once)
  | "rolled_back" // errors did not drop: undone automatically
  | "undone" // undone by the owner or visitor
  | "undo_failed" // the undo could not be done; the owner was told once
  | "failed"; // could not be applied (error in detail)

// Default (founder, 14 Nov): a WAKE that nobody answers in 3 minutes heals on its own, but only with a fix that passed
// every check and its own test, never in a protected area (payments, login...), at most 2 a night, always with Undo.
export const DEFAULT_POLICY: HealPolicy = { mode: "auto-after", after_min: 3, max_per_night: 2, flows: [] };
export const NIGHT_MS = 12 * 3_600_000;
export const SUSPEND_MS = 12 * 3_600_000;
/** Real apps without release tags: the deploy is assumed this long after the merge. */
export const GRACE_MS = 10 * 60_000;
/** Real apps: a heal with no real repeat of the error for this long after the deploy is confirmed. */
export const WATCH_MS = 30 * 60_000;
/** A rollback needs at least this many errors after the deploy, and at least this much time watched. */
export const MIN_ROLLBACK_EVENTS = 3;
export const MIN_ROLLBACK_WATCH_MS = 10 * 60_000;
/** Release-tagged apps: no new release within this long after the merge ends the watch as unconfirmed. */
export const DEPLOY_WAIT_MS = 24 * 3_600_000;
const SESSION_MAX = 3; // demo visitors: one per flow
const SESSION_TTL_MS = 24 * 3_600_000;
const SESSION_ROWS_MAX = 20_000;

// ---------- policy ----------

export function policyOf(db: DB, projectId: number): HealPolicy {
  const raw: Partial<HealPolicy> = getSettings(db, projectId).heal ?? {};
  return normalisePolicy(raw);
}

export function normalisePolicy(raw: Partial<HealPolicy>): HealPolicy {
  const mode: HealMode = (["off", "ask", "auto-after", "auto-now"] as const).includes(raw.mode as HealMode) ? (raw.mode as HealMode) : DEFAULT_POLICY.mode;
  const clamp = (n: unknown, lo: number, hi: number, d: number) => (Number.isInteger(n) ? Math.min(hi, Math.max(lo, n as number)) : d);
  return {
    mode,
    after_min: clamp(raw.after_min, 3, 240, DEFAULT_POLICY.after_min),
    max_per_night: clamp(raw.max_per_night, 1, 5, DEFAULT_POLICY.max_per_night),
    flows: Array.isArray(raw.flows) ? raw.flows.filter((f) => typeof f === "string" && /^\/[\w\-./]{0,80}$/.test(f)).slice(0, 10) : [],
    suspended_until: raw.suspended_until ?? null,
    suspended_reason: raw.suspended_reason ?? null,
  };
}

export function savePolicy(db: DB, projectId: number, patch: Partial<HealPolicy>): HealPolicy {
  const next = normalisePolicy({ ...policyOf(db, projectId), ...patch });
  setSettings(db, projectId, { heal: next });
  return next;
}

/**
 * Reads the words after /heal. Returns a patch to save, or an error to show, or "show" for no words.
 *   /heal off | /heal ask | /heal auto [3m] | /heal now [/route ...] | /heal max 2
 */
export function parseHealArgs(args: string[]): { patch: Partial<HealPolicy> } | { error: string } | "show" {
  const [word, ...rest] = args.map((a) => a.trim()).filter(Boolean);
  if (!word) return "show";
  const resume = { suspended_until: null, suspended_reason: null };
  switch (word.toLowerCase()) {
    case "off":
      return { patch: { mode: "off", ...resume } };
    case "ask":
      return { patch: { mode: "ask", ...resume } };
    case "auto":
    case "after": {
      const m = (rest[0] ?? "3m").match(/^(\d{1,3})\s*(m|min|mins|minutes?)?$/i);
      const n = m ? Number(m[1]) : NaN;
      if (!Number.isInteger(n) || n < 3 || n > 240) return { error: "Give the minutes to wait, from 3 to 240: /heal auto 3m" };
      return { patch: { mode: "auto-after", after_min: n, ...resume } };
    }
    case "now": {
      const bad = rest.find((r) => !/^\/[\w\-./]{0,80}$/.test(r));
      if (bad) return { error: "Routes start with /, like /heal now /api/submit (or /heal now for any route)." };
      return { patch: { mode: "auto-now", flows: rest.slice(0, 10), ...resume } };
    }
    case "max": {
      const n = Number(rest[0]);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: "Give a number from 1 to 5: /heal max 2" };
      return { patch: { max_per_night: n } };
    }
    default:
      return { error: "Use /heal ask, /heal auto 3m, /heal now, /heal off or /heal max 2." };
  }
}

export function describePolicy(p: HealPolicy, now = Date.now()): string {
  const base =
    p.mode === "off"
      ? "off: fixes arrive as diffs only; nothing is applied from here"
      : p.mode === "ask"
        ? "ask: you approve every fix"
        : p.mode === "auto-after"
          ? `heal on its own if a wake-up is not acknowledged within ${p.after_min} min`
          : `heal on its own right away${p.flows.length ? ` on ${p.flows.join(", ")}` : ""}`;
  const paused = p.suspended_until && Date.parse(p.suspended_until) > now ? ` · paused until ${p.suspended_until.slice(11, 16)} UTC (${p.suspended_reason ?? "a heal did not help"})` : "";
  return `${base} · at most ${p.max_per_night} per night${paused}`;
}

// ---------- the rules ----------

export type HealFacts = {
  policy: HealPolicy;
  trigger: HealTrigger;
  kind: "faurus" | "sandbox" | "paste";
  route: string | null;
  incident_status: string;
  owner_paused: boolean;
  fix_status: string;
  gate: { passed?: boolean; level?: string; test_run?: { verdict?: string } | null; review?: { unanimous?: boolean } | null };
  files: string[];
  risky: string[]; // riskyAdditions of the fix's edits
  authenticated: boolean; // every error in the incident carried the app's ingest secret
  heals_last_night: number;
  now: number;
};

/** Why a fix may NOT be applied; null means it may. Pure: every rule is here. */
export function healBlocker(f: HealFacts): string | null {
  const p = f.policy;
  if (f.kind === "paste") return "pasted errors are not live apps";
  if (f.trigger !== "owner") {
    if (p.mode === "off" || p.mode === "ask") return "your rule is to approve every fix yourself";
    if (f.trigger === "auto-after" && p.mode !== "auto-after") return "your rule does not heal after a wait";
    if (f.trigger === "auto-now") {
      if (p.mode !== "auto-now") return "your rule waits for you first";
      if (p.flows.length && !(f.route && p.flows.some((r) => f.route!.startsWith(r)))) return "this route is not one you chose to heal right away";
    }
    if (p.suspended_until && Date.parse(p.suspended_until) > f.now) return "self-healing is paused after a heal that did not help";
    if (f.owner_paused) return "you paused JaagteRaho";
    if (f.heals_last_night >= p.max_per_night) return `${p.max_per_night} heals already in 12 hours, your limit`;
    if (f.kind !== "sandbox" && !f.authenticated) return "these errors did not carry your app's server secret, so they could have been sent by anyone";
  }
  if (f.incident_status !== "open") return "the incident is no longer open";
  if (f.fix_status !== "shown") return f.fix_status === "rejected" ? "the fix was withheld by its checks" : `the fix is already ${f.fix_status}`;
  if (!f.gate.passed || f.gate.level !== "recommended") return f.gate.level === "caution" ? "the reviewer had concerns, so only you can apply it" : "only fixes that passed every check can be applied";
  // Real apps: every review vote must agree. (The demo portal writes no code; its fixes must be proved by a test instead.)
  if (f.trigger !== "owner" && f.kind !== "sandbox" && f.gate.review?.unanimous !== true) return "not every reviewer vote agreed it is safe";
  const sensitive = f.files.find((x) => HEAL_PROTECTED.test(x));
  if (sensitive) return `it touches a protected area (${sensitive})`;
  if (f.risky.length) return `the fix ${f.risky[0]}, which only a person may approve`;
  if (f.kind === "sandbox" && f.gate.test_run?.verdict !== "proved") return "its regression test did not prove it";
  return null;
}

/**
 * True when a heal did not help: enough errors after the deploy (MIN_ROLLBACK_EVENTS) and not under
 * half of the same stretch before it. One stray error never undoes a fix.
 */
export function notImproved(before: number, after: number): boolean {
  return after >= MIN_ROLLBACK_EVENTS && after >= before * 0.5;
}

/** The opposite edits, for undoing a fix that was merged. */
export function reverseEdits(edits: Array<{ file: string; find: string; replace: string }>) {
  return edits.map((e) => ({ file: e.file, find: e.replace, replace: e.find })).reverse();
}

/**
 * Write access for self-healing a real app: a token set by hand on the server for that app
 * (JR_GITHUB_HEAL_TOKEN_<app id>), bound to one repository (JR_GITHUB_HEAL_REPO_<app id>). If the
 * app's repository is changed (/repo), the token no longer applies.
 */
export function writeTokenFor(project: { id: number; kind: string; repo: string | null }): string | null {
  if (!project.repo || project.repo.startsWith("local:") || project.kind !== "faurus") return null;
  const token = process.env[`JR_GITHUB_HEAL_TOKEN_${project.id}`];
  const bound = process.env[`JR_GITHUB_HEAL_REPO_${project.id}`];
  if (!token || !bound || bound.trim().toLowerCase() !== project.repo.toLowerCase()) return null;
  return token;
}

/** The app's server-only ingest secret, made on first use. It goes in the server's DSN, never a browser's. */
export function ingestSecretFor(db: DB, projectId: number): string {
  const row = db.prepare("SELECT ingest_secret FROM projects WHERE id = ?").get(projectId) as { ingest_secret: string | null } | undefined;
  if (row?.ingest_secret) return row.ingest_secret;
  const secret = randomBytes(24).toString("hex");
  db.prepare("UPDATE projects SET ingest_secret = ? WHERE id = ? AND ingest_secret IS NULL").run(secret, projectId);
  return (db.prepare("SELECT ingest_secret FROM projects WHERE id = ?").get(projectId) as { ingest_secret: string }).ingest_secret;
}

/** The server-side DSN: the public key plus the secret (Python's sentry-sdk sends it as sentry_secret). */
export function secretDsnFor(db: DB, projectId: number): string {
  const p = db.prepare("SELECT public_key FROM projects WHERE id = ?").get(projectId) as { public_key: string };
  const dsn = new URL(dsnFor(p.public_key, projectId));
  dsn.password = ingestSecretFor(db, projectId);
  return dsn.toString();
}

// ---------- GitHub (injectable for tests) ----------

type Edit = { file: string; find: string; replace: string };
export type MergeResult = { ok: true; merged: boolean } | { ok: false; error: string };
export type GitHubOps = {
  openPr(o: { repo: string; token: string; edits: Edit[]; branch: string; title: string; body: string; commitNote: string }): Promise<{ ok: true; url: string; number: number } | { ok: false; error: string }>;
  /**
   * Turns on auto-merge. requireChecks: refuse unless the base branch requires status checks, so the
   * repository's own checks decide (used for every merge no person asked for). Without requireChecks
   * (the owner tapped Approve or Undo), a pull request GitHub already calls mergeable is merged now.
   */
  autoMerge(repo: string, token: string, number: number, requireChecks: boolean): Promise<MergeResult>;
  disableAutoMerge(repo: string, token: string, number: number): Promise<void>;
  state(repo: string, token: string, number: number): Promise<{ merged_at: string | null; state: string } | null>;
  close(repo: string, token: string, number: number): Promise<boolean>;
};

const gh = async <T>(token: string, method: string, url: string, body?: unknown): Promise<T> => {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "jaagteraho-watcher",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub ${method}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
};

/** Does the branch require status checks (classic protection or a ruleset)? Unknown counts as no. */
async function requiresChecks(repo: string, token: string, branch: string): Promise<boolean> {
  const b = encodeURIComponent(branch);
  const classic = await gh<{ contexts?: string[]; checks?: unknown[] }>(token, "GET", `https://api.github.com/repos/${repo}/branches/${b}/protection/required_status_checks`).catch(() => null);
  if (classic && ((classic.contexts?.length ?? 0) > 0 || (classic.checks?.length ?? 0) > 0)) return true;
  const rules = await gh<Array<{ type: string; parameters?: { required_status_checks?: unknown[] } }>>(token, "GET", `https://api.github.com/repos/${repo}/rules/branches/${b}`).catch(() => []);
  return rules.some((r) => r.type === "required_status_checks" && (r.parameters?.required_status_checks?.length ?? 0) > 0);
}

const graphql = (token: string, query: string, id: string) =>
  gh<{ errors?: Array<{ message: string }> }>(token, "POST", "https://api.github.com/graphql", { query, variables: { id } });

export const realGitHub: GitHubOps = {
  async openPr(o) {
    const out = await openFixPullRequest({ ...o });
    return out.ok ? { ok: true, url: out.url, number: out.number } : { ok: false, error: out.error };
  },
  async autoMerge(repo, token, number, requireChecks) {
    try {
      const pr = await gh<{ node_id: string; base: { ref: string } }>(token, "GET", `https://api.github.com/repos/${repo}/pulls/${number}`);
      if (requireChecks && !(await requiresChecks(repo, token, pr.base.ref))) return { ok: false, error: "the repository requires no status checks, so it is left for you to merge" };
      const r = await graphql(token, `mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }`, pr.node_id);
      if (!r.errors?.length) return { ok: true, merged: false };
      // "Clean status": GitHub says it is mergeable now. With required checks that means they passed;
      // without them we merge only when a person asked (requireChecks false).
      if (r.errors.some((e) => /clean status/i.test(e.message))) {
        await gh(token, "PUT", `https://api.github.com/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash" });
        return { ok: true, merged: true };
      }
      return { ok: false, error: r.errors.map((e) => e.message).join("; ").slice(0, 200) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
  async disableAutoMerge(repo, token, number) {
    const pr = await gh<{ node_id: string }>(token, "GET", `https://api.github.com/repos/${repo}/pulls/${number}`).catch(() => null);
    if (pr) await graphql(token, `mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }`, pr.node_id).catch(() => null);
  },
  async state(repo, token, number) {
    return gh<{ merged_at: string | null; state: string }>(token, "GET", `https://api.github.com/repos/${repo}/pulls/${number}`).catch(() => null);
  },
  async close(repo, token, number) {
    return gh(token, "PATCH", `https://api.github.com/repos/${repo}/pulls/${number}`, { state: "closed" }).then(() => true, () => false);
  },
};

// ---------- the healer ----------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS heals (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id),
  incident_id   INTEGER NOT NULL REFERENCES incidents(id),
  fix_id        INTEGER NOT NULL REFERENCES fixes(id),
  session_id    TEXT,
  flow          TEXT,
  trigger       TEXT NOT NULL,
  status        TEXT NOT NULL,
  detail        TEXT,
  pr_url        TEXT,
  pr_number     INTEGER,
  hits_before   INTEGER NOT NULL DEFAULT 0,
  release_before TEXT,
  applied_at    TEXT,
  deployed_at   TEXT,
  ended_at      TEXT,
  log           TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS heals_incident ON heals(incident_id, id);
CREATE INDEX IF NOT EXISTS heals_project ON heals(project_id, created_at);
CREATE TABLE IF NOT EXISTS heal_sessions (
  session_id TEXT PRIMARY KEY,
  at         TEXT NOT NULL
);
`;

export function ensureHealSchema(db: DB) {
  db.exec(SCHEMA);
}

export type HealRow = {
  id: number; project_id: number; incident_id: number; fix_id: number; session_id: string | null; flow: string | null; trigger: HealTrigger;
  status: HealStatus; detail: string | null; pr_url: string | null; pr_number: number | null; hits_before: number; release_before: string | null;
  applied_at: string | null; deployed_at: string | null; ended_at: string | null; log: string; created_at: string;
};

/** The demo portal's flows, keyed by the visitor's button. */
export const SANDBOX_FLOWS: Record<string, string> = { submit: "/api/submit", exam: "/api/exam/start", pay: "/api/pay" };

type FixInfo = {
  fix_id: number; status: string; gate_result: string; diff: string; result: string; incident_id: number; incident_status: string;
  exception_type: string; transaction_name: string | null; project_id: number; project_name: string; kind: "faurus" | "sandbox" | "paste"; repo: string | null;
};

const UNDOABLE = "('pr_open','merging','applied','verified','unconfirmed')";
const COUNTED = "('pr_open','merging','applied','verified','unconfirmed','undoing','rolled_back','undone','undo_failed')";

export type HealerOptions = { twinFixed: string; github?: GitHubOps; fetch?: typeof fetch };

export class Healer {
  private timer: NodeJS.Timeout | null = null;
  private github: GitHubOps;
  private fetcher: typeof fetch;

  constructor(private db: DB, private tg: Telegram | null, private opts: HealerOptions) {
    ensureHealSchema(db);
    this.github = opts.github ?? realGitHub;
    this.fetcher = opts.fetch ?? fetch;
  }

  start() {
    // One tick at a time: GitHub calls can take longer than the interval.
    let busy = false;
    this.timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void this.tick()
        .catch((e) => console.error("heal tick:", e))
        .finally(() => (busy = false));
    }, 30_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * A demo visitor's choice for their own session: approve each fix (no row: the default), or heal
   * on its own. Rows expire after a day and the table is capped, so it cannot grow without bound.
   */
  static setSessionMode(db: DB, session: string, auto: boolean, now = Date.now()) {
    ensureHealSchema(db);
    if (!auto) {
      db.prepare("DELETE FROM heal_sessions WHERE session_id = ?").run(session);
      return;
    }
    db.prepare("DELETE FROM heal_sessions WHERE at < ?").run(new Date(now - SESSION_TTL_MS).toISOString());
    const n = (db.prepare("SELECT COUNT(*) AS n FROM heal_sessions").get() as { n: number }).n;
    const exists = db.prepare("SELECT 1 FROM heal_sessions WHERE session_id = ?").get(session);
    if (!exists && n >= SESSION_ROWS_MAX) return; // full: this visitor approves by hand
    db.prepare("INSERT INTO heal_sessions (session_id, at) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET at = excluded.at").run(session, new Date(now).toISOString());
  }

  private sessionPolicy(session: string): HealPolicy {
    const row = this.db.prepare("SELECT at FROM heal_sessions WHERE session_id = ?").get(session) as { at: string } | undefined;
    const auto = !!row && Date.now() - Date.parse(row.at) < SESSION_TTL_MS;
    return normalisePolicy({ mode: auto ? "auto-now" : "ask", max_per_night: SESSION_MAX });
  }

  private fixInfo(fixId: number): FixInfo | undefined {
    return this.db
      .prepare(
        `SELECT f.id AS fix_id, f.status, f.gate_result, f.diff, d.result, i.id AS incident_id, i.status AS incident_status, i.exception_type, i.transaction_name,
                p.id AS project_id, p.name AS project_name, p.kind, p.repo
         FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id JOIN incidents i ON i.id = d.incident_id JOIN projects p ON p.id = i.project_id WHERE f.id = ?`,
      )
      .get(fixId) as FixInfo | undefined;
  }

  private latestFix(incidentId: number): number | null {
    const r = this.db
      .prepare("SELECT f.id FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id WHERE d.incident_id = ? ORDER BY f.id DESC LIMIT 1")
      .get(incidentId) as { id: number } | undefined;
    return r?.id ?? null;
  }

  private healsSince(projectId: number, session: string | null, sinceMs: number): number {
    const since = new Date(sinceMs).toISOString();
    return session
      ? (this.db.prepare(`SELECT COUNT(*) AS n FROM heals WHERE session_id = ? AND status IN ${COUNTED} AND created_at > ?`).get(session, since) as { n: number }).n
      : (this.db.prepare(`SELECT COUNT(*) AS n FROM heals WHERE project_id = ? AND session_id IS NULL AND status IN ${COUNTED} AND created_at > ?`).get(projectId, since) as { n: number }).n;
  }

  /** Every error in the incident carried the app's ingest secret (and there was at least one). */
  private incidentAuthenticated(incidentId: number): boolean {
    const r = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(authenticated), 0) AS a FROM events WHERE incident_id = ?").get(incidentId) as { n: number; a: number };
    return r.n > 0 && r.a === r.n;
  }

  /** Everything the rules need, then the rules. */
  check(fixId: number, trigger: HealTrigger, session: string | null, now = Date.now()): { blocker: string | null; info?: FixInfo; policy?: HealPolicy } {
    const info = this.fixInfo(fixId);
    if (!info) return { blocker: "no fix" };
    const policy = info.kind === "sandbox" && session ? this.sessionPolicy(session) : policyOf(this.db, info.project_id);
    const owner = this.db.prepare("SELECT paused FROM owners WHERE project_id = ?").get(info.project_id) as { paused: number } | undefined;
    const edits = (JSON.parse(info.result) as { edits?: Edit[] }).edits ?? [];
    const blocker = healBlocker({
      policy,
      trigger,
      kind: info.kind,
      route: info.transaction_name,
      incident_status: info.incident_status,
      owner_paused: !session && owner?.paused === 1,
      fix_status: info.status,
      gate: JSON.parse(info.gate_result),
      files: edits.map((e) => e.file),
      // Recomputed here, plus what the gate found with the full original files (modules the file already imports).
      risky: [...new Set([...riskyAdditions(edits), ...((JSON.parse(info.gate_result) as { risky?: string[] }).risky ?? [])])],
      authenticated: this.incidentAuthenticated(info.incident_id),
      heals_last_night: this.healsSince(info.project_id, session, now - NIGHT_MS),
      now,
    });
    return { blocker, info, policy };
  }

  private insert(info: FixInfo, trigger: HealTrigger, status: HealStatus, detail: string | null, session: string | null, flow: string | null): number {
    const hitsBefore = this.errorsBetween(info.incident_id, Date.now() - WATCH_MS, Date.now(), null);
    const now = new Date().toISOString();
    return Number(
      this.db
        .prepare("INSERT INTO heals (project_id, incident_id, fix_id, session_id, flow, trigger, status, detail, hits_before, log, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(info.project_id, info.incident_id, info.fix_id, session, flow, trigger, status, detail, hitsBefore, JSON.stringify([{ at: now, what: `${status}${detail ? `: ${detail}` : ""}` }]), now)
        .lastInsertRowid,
    );
  }

  private update(id: number, status: HealStatus, detail: string | null, extra: Partial<Pick<HealRow, "pr_url" | "pr_number" | "applied_at" | "deployed_at" | "ended_at" | "release_before">> = {}) {
    const row = this.get(id)!;
    const log = [...(JSON.parse(row.log) as unknown[]), { at: new Date().toISOString(), what: `${status}${detail ? `: ${detail}` : ""}` }];
    this.db
      .prepare(
        `UPDATE heals SET status = ?, detail = ?, pr_url = COALESCE(?, pr_url), pr_number = COALESCE(?, pr_number), applied_at = COALESCE(?, applied_at),
         deployed_at = COALESCE(?, deployed_at), ended_at = COALESCE(?, ended_at), release_before = COALESCE(?, release_before), log = ? WHERE id = ?`,
      )
      .run(status, detail, extra.pr_url ?? null, extra.pr_number ?? null, extra.applied_at ?? null, extra.deployed_at ?? null, extra.ended_at ?? null, extra.release_before ?? null, JSON.stringify(log), id);
  }

  get(id: number): HealRow | undefined {
    return this.db.prepare("SELECT * FROM heals WHERE id = ?").get(id) as HealRow | undefined;
  }

  latestFor(incidentId: number): HealRow | undefined {
    return this.db.prepare("SELECT * FROM heals WHERE incident_id = ? AND session_id IS NULL ORDER BY id DESC LIMIT 1").get(incidentId) as HealRow | undefined;
  }

  /**
   * Errors of this incident in a time window. When the incident has errors carrying the ingest secret,
   * only those count (a forged error must not undo a good fix). After a release-tagged deploy, errors
   * still reported by the old release are not counted against the fix.
   */
  private errorsBetween(incidentId: number, fromMs: number, toMs: number, notRelease: string | null): number {
    const authed = (this.db.prepare("SELECT 1 FROM events WHERE incident_id = ? AND authenticated = 1 LIMIT 1").get(incidentId) as unknown) !== undefined;
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM events WHERE incident_id = ? AND received_at > ? AND received_at <= ?
           ${authed ? "AND authenticated = 1" : ""} ${notRelease ? "AND (release IS NULL OR release != ?)" : ""}`,
        )
        .get(incidentId, new Date(fromMs).toISOString(), new Date(toMs).toISOString(), ...(notRelease ? [notRelease] : [])) as { n: number }
    ).n;
  }

  private latestRelease(projectId: number): string | null {
    const r = this.db.prepare("SELECT release FROM events WHERE project_id = ? AND release IS NOT NULL AND authenticated = 1 ORDER BY id DESC LIMIT 1").get(projectId) as { release: string } | undefined;
    return r?.release ?? null;
  }

  private feed(session: string | null, type: FeedEvent["type"], incidentId: number, data: Record<string, unknown>) {
    bus.publish(session, { type, at: new Date().toISOString(), incident_id: incidentId, data });
  }

  private async tell(projectId: number, text: string, markup?: Markup) {
    const owner = this.db.prepare("SELECT chat_id FROM owners WHERE project_id = ?").get(projectId) as { chat_id: number } | undefined;
    if (!owner || !this.tg) return;
    await this.tg.send(owner.chat_id, text, markup).catch((e) => console.error("heal tell:", e));
  }

  /** Keeps the wake-up going: the repeats start again, because nobody fixed it yet. */
  private keepPaging(incidentId: number) {
    this.db.prepare("UPDATE alerts SET pings = 0, acked = 0, action = 'wake', last_ping_at = ? WHERE incident_id = ?").run(new Date(0).toISOString(), incidentId);
  }

  /** Called by the worker once an incident's fix is checked (live or replayed). */
  async onFix(incidentId: number, ctx: { session: string | null; action: string }): Promise<HealRow | null> {
    if (ctx.action !== "notify" && ctx.action !== "wake") return null;
    const fixId = this.latestFix(incidentId);
    if (!fixId) return null;
    const info = this.fixInfo(fixId);
    if (!info) return null;
    if (info.kind === "sandbox") {
      if (!ctx.session) return null; // the owner's own demo card keeps its Approve button
      return this.healSandbox(fixId, ctx.session);
    }
    if (this.latestFor(incidentId)) return null; // one try per incident
    const { blocker } = this.check(fixId, "auto-now", null);
    if (blocker) return null; // "ask" and "auto-after" wait; nothing to record yet
    return this.healReal(fixId, "auto-now");
  }

  // ---------- demo portal ----------

  private async healSandbox(fixId: number, session: string): Promise<HealRow | null> {
    const { blocker, info, policy } = this.check(fixId, "auto-now", session);
    if (!info || policy?.mode !== "auto-now") return null;
    const flow = Object.keys(SANDBOX_FLOWS).find((k) => SANDBOX_FLOWS[k] === info.transaction_name) ?? null;
    if (!flow) return null;
    if (blocker) {
      const id = this.insert(info, "auto-now", "skipped", blocker, session, flow);
      this.feed(session, "heal", info.incident_id, { heal_id: id, status: "skipped", reason: blocker, fix_id: fixId });
      return this.get(id)!;
    }
    const id = this.insert(info, "auto-now", "applied", "switched to the fixed build", session, flow);
    this.db.prepare("INSERT OR REPLACE INTO session_fixes (session_id, flow, fix_id, at) VALUES (?, ?, ?, ?)").run(session, flow, fixId, new Date().toISOString());
    this.update(id, "applied", "switched to the fixed build", { applied_at: new Date().toISOString() });
    // Proof: the same request that failed is sent again, now to the fixed build.
    let status = 0;
    let result: unknown = null;
    try {
      const res = await this.fetcher(`${this.opts.twinFixed}${info.transaction_name}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-jr-session": session, "x-jr-exam": "off", "x-jr-heal-check": "1" },
        body: "{}",
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      result = await res.json().catch(() => null);
    } catch {
      status = 0;
    }
    if (status > 0 && status < 500) {
      this.update(id, "verified", `the same request now answers ${status}`, { ended_at: new Date().toISOString() });
      this.feed(session, "heal", info.incident_id, { heal_id: id, status: "verified", fix_id: fixId, flow, proof: { status, result } });
    } else {
      this.db.prepare("DELETE FROM session_fixes WHERE session_id = ? AND flow = ?").run(session, flow);
      this.update(id, "rolled_back", status ? `the request still failed (${status})` : "the fixed build did not answer", { ended_at: new Date().toISOString() });
      this.feed(session, "heal", info.incident_id, { heal_id: id, status: "rolled_back", fix_id: fixId, flow, reason: "the request still failed after the fix, so it was rolled back; the owner keeps the alert" });
    }
    return this.get(id)!;
  }

  /** A demo visitor's Undo: their session goes back to the broken build. */
  undoSession(healId: number, session: string): boolean {
    const h = this.get(healId);
    if (!h || h.session_id !== session || !h.flow) return false;
    // Claimed atomically, so a double tap undoes once.
    if (this.db.prepare("UPDATE heals SET status = 'undoing' WHERE id = ? AND status IN ('applied', 'verified')").run(healId).changes !== 1) return false;
    this.db.prepare("DELETE FROM session_fixes WHERE session_id = ? AND flow = ? AND fix_id = ?").run(session, h.flow, h.fix_id);
    this.update(healId, "undone", "undone by the visitor", { ended_at: new Date().toISOString() });
    this.feed(session, "heal", h.incident_id, { heal_id: healId, status: "undone", flow: h.flow });
    return true;
  }

  // ---------- real apps ----------

  /** Applies a fix to a real app: a pull request with auto-merge, or the diff when there is no write access. */
  async healReal(fixId: number, trigger: HealTrigger): Promise<HealRow | null> {
    const { blocker, info } = this.check(fixId, trigger, null);
    if (!info) return null;
    if (blocker) {
      if (trigger === "owner") return null;
      const id = this.insert(info, trigger, "skipped", blocker, null, null);
      await this.tell(info.project_id, `<b>Not healing on its own</b> · ${esc(info.project_name)}: ${esc(blocker)}. Still waiting for you on the alert.`);
      return this.get(id)!;
    }
    const what = `${info.exception_type} on ${info.transaction_name ?? "the app"}`;
    const token = writeTokenFor({ id: info.project_id, kind: info.kind, repo: info.repo });
    if (!token || !info.repo) {
      const id = this.insert(info, trigger, "diff_sent", "no write access to the repository", null, null);
      if (trigger !== "owner") this.keepPaging(info.incident_id);
      await this.tell(
        info.project_id,
        [
          `<b>Ready to heal, but I can't write to ${esc(info.project_name)}</b>`,
          `${esc(what)}. The fix passed every check. Apply this diff and deploy:`,
          `<pre>${esc(info.diff.slice(0, 3000))}</pre>`,
          trigger === "owner" ? "" : "I'll keep paging you until someone acknowledges.",
        ].filter(Boolean).join("\n"),
      );
      return this.get(id)!;
    }
    // Claim the fix so a double trigger cannot open two pull requests.
    if (this.db.prepare("UPDATE fixes SET status = 'approved' WHERE id = ? AND status = 'shown'").run(fixId).changes !== 1) return null;
    const id = this.insert(info, trigger, "pr_open", null, null, null);
    const r = JSON.parse(info.result) as { cause_plain: string; cause_technical: string; test_hint: string; edits: Edit[] };
    const by = trigger === "owner" ? "approved by the owner on Telegram" : trigger === "auto-after" ? "opened on its own: the owner did not answer the wake-up, and their heal rule allows it" : "opened on its own under the owner's heal rule";
    const pr = await this.github.openPr({
      repo: info.repo,
      token,
      edits: r.edits,
      branch: `jr/heal-${id}-${Date.now().toString(36)}`,
      title: `Fix ${what} (JaagteRaho)`,
      body: [
        `**Cause, in plain words:** ${r.cause_plain}`, "", `**Technical:** ${r.cause_technical}`, "", `**How to check:** ${r.test_hint}`, "",
        `AI-written fix that passed JaagteRaho's six code checks and review; ${by}.${trigger === "owner" ? "" : " Set to merge only when this repository's required checks pass."}`,
      ].join("\n"),
      commitNote: `Proposed by JaagteRaho; ${by}.`,
    });
    if (!pr.ok) {
      this.db.prepare("UPDATE fixes SET status = 'shown' WHERE id = ?").run(fixId);
      this.update(id, "failed", pr.error, { ended_at: new Date().toISOString() });
      if (trigger !== "owner") this.keepPaging(info.incident_id);
      await this.tell(info.project_id, `<b>Could not heal ${esc(info.project_name)}</b>: ${esc(pr.error)}. Still waiting for you.`);
      return this.get(id)!;
    }
    this.db.prepare("UPDATE fixes SET pr_url = ? WHERE id = ?").run(pr.url, fixId);
    // Nobody asked for this merge: it may only happen behind the repository's required checks.
    const merge = await this.github.autoMerge(info.repo, token, pr.number, trigger !== "owner");
    if (!merge.ok) {
      this.update(id, "pr_open", `not set to merge by itself: ${merge.error}`, { pr_url: pr.url, pr_number: pr.number });
      if (trigger !== "owner") this.keepPaging(info.incident_id);
      await this.tell(
        info.project_id,
        `<b>Fix ready as a pull request</b> · ${esc(info.project_name)}: ${esc(pr.url)}\nIt will not merge by itself (${esc(merge.error)}). Merge it to heal.${trigger === "owner" ? "" : " Still paging you."}`,
        this.undoMarkup(id),
      );
      return this.get(id)!;
    }
    if (merge.merged) {
      this.update(id, "applied", "merged", { pr_url: pr.url, pr_number: pr.number, applied_at: new Date().toISOString(), release_before: this.latestRelease(info.project_id) });
      await this.reportApplied(id);
    } else {
      this.update(id, "merging", "auto-merge on: merges when the repository's required checks pass", { pr_url: pr.url, pr_number: pr.number });
      await this.tell(info.project_id, `<b>Healing ${esc(info.project_name)}</b>: pull request ${esc(pr.url)} merges on its own once your required checks pass. Then I watch the errors after your deploy.`, this.undoMarkup(id));
    }
    return this.get(id)!;
  }

  private undoMarkup(healId: number): Markup {
    return { inline_keyboard: [[{ text: "Undo", callback_data: `u:${healId}` }]] };
  }

  /** "Healed while you were away": what broke, what changed, how it will be proved, one tap to undo. */
  private async reportApplied(healId: number) {
    const h = this.get(healId)!;
    const info = this.fixInfo(h.fix_id)!;
    const r = JSON.parse(info.result) as { cause_plain: string; file: string; line: number };
    const g = JSON.parse(info.gate_result) as { changed_lines?: number };
    await this.tell(
      h.project_id,
      [
        `<b>${h.trigger === "owner" ? "Fix merged" : "Healed while you were away"}</b> · ${esc(info.project_name)}`,
        `<b>What broke:</b> ${esc(info.exception_type)} on ${esc(info.transaction_name ?? "the app")}, ${h.hits_before} times in the 30 min before.`,
        `<b>Cause:</b> ${esc(r.cause_plain)}`,
        `<b>What I changed:</b> <code>${esc(r.file)}:${r.line}</code>, ${g.changed_lines ?? "?"} lines${h.pr_url ? ` · ${esc(h.pr_url)}` : ""}`,
        `<b>Proof:</b> once your deploy is live I watch the error for ${WATCH_MS / 60_000} min. If it does not drop, I undo it and wake you again.`,
      ].join("\n"),
      this.undoMarkup(healId),
    );
  }

  /**
   * Undo by the owner, or automatically when a heal did not help. Claimed atomically ("undoing"), so an
   * owner tap and a rollback cannot both run. A PR that has not merged is closed after its auto-merge is
   * turned off, then checked again in case it merged in between; a merged one gets a revert PR.
   */
  async undo(healId: number, why: "owner" | "no improvement"): Promise<{ done: boolean; message: string }> {
    const h = this.get(healId);
    if (!h || h.session_id) return { done: false, message: "Not found." };
    if (this.db.prepare(`UPDATE heals SET status = 'undoing' WHERE id = ? AND status IN ${UNDOABLE}`).run(healId).changes !== 1) {
      return { done: false, message: `Nothing to undo: ${(this.get(healId)?.status ?? "gone").replace("_", " ")}.` };
    }
    const endAs: HealStatus = why === "owner" ? "undone" : "rolled_back";
    const label = why === "owner" ? "undone by the owner" : "rolled back: the errors did not drop";
    const failed = (msg: string) => {
      this.update(healId, "undo_failed", msg, { ended_at: new Date().toISOString() });
      return { done: false, message: msg };
    };
    const info = this.fixInfo(h.fix_id)!;
    const token = writeTokenFor({ id: info.project_id, kind: info.kind, repo: info.repo });
    if (!token || !info.repo || !h.pr_number) return failed("No write access to undo it; revert the pull request on GitHub.");

    let st = await this.github.state(info.repo, token, h.pr_number);
    if (st && !st.merged_at && st.state !== "closed") {
      await this.github.disableAutoMerge(info.repo, token, h.pr_number);
      await this.github.close(info.repo, token, h.pr_number);
      st = await this.github.state(info.repo, token, h.pr_number);
    }
    if (!st) return failed("GitHub did not answer, so nothing was undone. Revert the pull request on GitHub.");
    if (!st.merged_at) {
      this.db.prepare("UPDATE fixes SET status = 'shown' WHERE id = ? AND status = 'approved'").run(h.fix_id);
      this.update(healId, endAs, `${label} · pull request closed before it merged`, { ended_at: new Date().toISOString() });
      return { done: true, message: "Closed the pull request before it merged. Nothing changed in your code." };
    }
    const r = JSON.parse(info.result) as { edits: Edit[] };
    const rev = await this.github.openPr({
      repo: info.repo,
      token,
      edits: reverseEdits(r.edits),
      branch: `jr/undo-${healId}-${Date.now().toString(36)}`,
      title: `Undo JaagteRaho fix #${h.pr_number}`,
      body: `Reverts #${h.pr_number}: ${label}.`,
      commitNote: `JaagteRaho: ${label}.`,
    });
    if (!rev.ok) return failed(`Could not open the undo pull request (${rev.error}). Revert #${h.pr_number} on GitHub.`);
    // The owner asked for this undo; an automatic rollback goes in only behind required checks.
    const m = await this.github.autoMerge(info.repo, token, rev.number, why !== "owner");
    this.update(healId, endAs, `${label} · ${rev.url}${m.ok ? "" : " (merge it yourself)"}`, { ended_at: new Date().toISOString() });
    return { done: true, message: `Undo pull request ${rev.url}${m.ok ? (m.merged ? " merged." : " merges when your checks pass.") : ". Merge it to finish."}` };
  }

  /** Every 30 seconds: unanswered wake-ups past the owner's wait, merges to follow, heals to confirm or roll back. */
  async tick(now = Date.now()) {
    this.db.prepare("DELETE FROM heal_sessions WHERE at < ?").run(new Date(now - SESSION_TTL_MS).toISOString());

    // 1. auto-after: a WAKE nobody acknowledged within the owner's minutes.
    const waiting = this.db
      .prepare(
        `SELECT a.incident_id, i.project_id, (SELECT MAX(created_at) FROM decisions d WHERE d.incident_id = a.incident_id AND d.action = 'wake') AS woke_at
         FROM alerts a JOIN incidents i ON i.id = a.incident_id JOIN projects p ON p.id = i.project_id
         WHERE a.action = 'wake' AND a.acked = 0 AND i.status = 'open' AND p.kind = 'faurus'
           AND NOT EXISTS (SELECT 1 FROM heals h WHERE h.incident_id = a.incident_id)`,
      )
      .all() as Array<{ incident_id: number; project_id: number; woke_at: string | null }>;
    for (const w of waiting) {
      const p = policyOf(this.db, w.project_id);
      if (p.mode !== "auto-after" || !w.woke_at || now - Date.parse(w.woke_at) < p.after_min * 60_000) continue;
      const fixId = this.latestFix(w.incident_id);
      if (!fixId) continue; // still diagnosing
      await this.healReal(fixId, "auto-after");
    }

    // 2. Pull requests waiting to merge (auto-merge, or the owner by hand).
    const merging = this.db.prepare("SELECT id FROM heals WHERE status IN ('merging', 'pr_open') AND session_id IS NULL").all() as Array<{ id: number }>;
    for (const { id } of merging) {
      const h = this.get(id)!;
      const info = this.fixInfo(h.fix_id)!;
      const token = writeTokenFor({ id: info.project_id, kind: info.kind, repo: info.repo });
      if (!token || !info.repo || !h.pr_number) continue;
      const st = await this.github.state(info.repo, token, h.pr_number);
      if (st?.merged_at) {
        if (this.db.prepare("UPDATE heals SET status = 'applied' WHERE id = ? AND status IN ('merging', 'pr_open')").run(id).changes !== 1) continue;
        this.update(id, "applied", "merged; waiting for the deploy", { applied_at: st.merged_at, release_before: this.latestRelease(info.project_id) });
        await this.reportApplied(id);
      } else if (st && st.state === "closed") {
        if (this.db.prepare("UPDATE heals SET status = 'undone' WHERE id = ? AND status IN ('merging', 'pr_open')").run(id).changes !== 1) continue;
        this.db.prepare("UPDATE fixes SET status = 'shown' WHERE id = ? AND status = 'approved'").run(h.fix_id);
        this.update(id, "undone", "the pull request was closed without merging", { ended_at: new Date().toISOString() });
      }
    }

    // 3. Merged heals: find the deploy, then confirm, or roll back and wake the owner again.
    const applied = this.db.prepare("SELECT id FROM heals WHERE status = 'applied' AND session_id IS NULL").all() as Array<{ id: number }>;
    for (const { id } of applied) {
      let h = this.get(id)!;
      const info = this.fixInfo(h.fix_id)!;
      const merged = Date.parse(h.applied_at!);
      if (!h.deployed_at) {
        if (h.release_before) {
          // The deploy is the first error report from a newer release after the merge.
          const seen = this.db
            .prepare("SELECT MIN(received_at) AS at FROM events WHERE project_id = ? AND received_at > ? AND release IS NOT NULL AND release != ? AND authenticated = 1")
            .get(h.project_id, h.applied_at, h.release_before) as { at: string | null };
          if (seen.at) this.update(id, "applied", "deploy seen: a newer release is reporting", { deployed_at: seen.at });
          else {
            if (now - merged >= DEPLOY_WAIT_MS) {
              this.update(id, "unconfirmed", "no newer release reported within a day, so the fix could not be checked", { ended_at: new Date(now).toISOString() });
              await this.tell(h.project_id, `<b>Heal not confirmed</b> · ${esc(info.project_name)}: the fix merged, but no newer release reported in, so I could not check it.`, this.undoMarkup(id));
            }
            continue;
          }
        } else {
          // No release tags: assume the deploy GRACE_MS after the merge.
          if (now - merged < GRACE_MS) continue;
          this.update(id, "applied", "no release tags: watching from 10 min after the merge", { deployed_at: new Date(merged + GRACE_MS).toISOString() });
        }
        h = this.get(id)!;
      }
      const t0 = Date.parse(h.deployed_at!);
      const watched = Math.min(now, t0 + WATCH_MS) - t0;
      if (watched <= 0) continue;
      const after = this.errorsBetween(h.incident_id, t0, t0 + watched, h.release_before);
      const beforeSameStretch = h.hits_before * (watched / WATCH_MS);
      if (watched >= MIN_ROLLBACK_WATCH_MS && notImproved(beforeSameStretch, after)) {
        const out = await this.undo(id, "no improvement");
        if (!out.done && this.get(id)?.status !== "undo_failed") continue; // someone else is undoing it
        savePolicy(this.db, h.project_id, { suspended_until: new Date(now + SUSPEND_MS).toISOString(), suspended_reason: "a heal did not bring the errors down" });
        this.keepPaging(h.incident_id);
        await this.tell(
          h.project_id,
          `🔴 <b>WAKE · the heal did not help</b> · ${esc(info.project_name)}\n${esc(info.exception_type)} came back ${after} times after the fix was deployed. ${esc(out.message)}\nSelf-healing is paused for 12 hours. /heal to change it.`,
        );
      } else if (watched >= WATCH_MS) {
        this.update(id, "verified", `${after} repeats of the error in the ${WATCH_MS / 60_000} min after the deploy`, { ended_at: new Date(now).toISOString() });
        this.db.prepare("UPDATE fixes SET status = 'merged' WHERE id = ?").run(h.fix_id);
        await this.tell(h.project_id, `✅ <b>Heal confirmed</b> · ${esc(info.project_name)}: ${after ? `only ${after}` : "no"} ${esc(info.exception_type)} in the ${WATCH_MS / 60_000} min after the deploy.`, this.undoMarkup(id));
      }
    }
  }
}

/** One line for the alert card. */
export function healLine(h: HealRow | undefined): string | null {
  if (!h) return null;
  const pr = h.pr_url ? ` · <a href="${esc(h.pr_url)}">PR</a>` : "";
  switch (h.status) {
    case "skipped":
      return `<b>Self-heal:</b> not on its own (${esc(h.detail ?? "")})`;
    case "diff_sent":
      return "<b>Self-heal:</b> no write access, diff sent to you";
    case "pr_open":
      return `<b>Self-heal:</b> pull request open, merge it to heal${pr}`;
    case "merging":
      return `<b>Self-heal:</b> merging when your required checks pass${pr}`;
    case "applied":
      return `<b>Self-heal:</b> merged, watching the errors after the deploy${pr}`;
    case "verified":
      return "<b>Self-heal:</b> healed, confirmed ✅";
    case "unconfirmed":
      return "<b>Self-heal:</b> merged, no deploy seen to confirm it";
    case "undoing":
      return "<b>Self-heal:</b> undoing…";
    case "rolled_back":
      return "<b>Self-heal:</b> rolled back, it did not help";
    case "undone":
      return "<b>Self-heal:</b> undone";
    case "undo_failed":
      return `<b>Self-heal:</b> undo failed (${esc(h.detail ?? "")})`;
    case "failed":
      return `<b>Self-heal:</b> failed (${esc(h.detail ?? "")})`;
    default:
      return null;
  }
}
