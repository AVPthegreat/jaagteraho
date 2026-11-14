// Self-healing under rules the owner sets. By default the owner approves every fix ("ask").
// The owner can instead let a checked fix go in on its own: right away ("auto-now"), or when a
// WAKE alert is not acknowledged within N minutes ("auto-after"). Only fixes the gate marked
// "recommended" qualify; never in protected areas; at most a few per night; and a heal that does
// not bring the errors down is rolled back, the owner is woken again and self-healing pauses.
//
// What "apply" means depends on the app:
// - Demo portal (sandbox): the visitor's session is switched to the portal's fixed build and the
//   failing request is sent again, so the proof is immediate.
// - A real app: only with write access (a token set on the server for that repository). A pull
//   request is opened with the fix and GitHub auto-merge is turned on, so the repository's own
//   checks still decide. Without write access the owner gets the ready-to-apply diff and paging goes on.

import { bus, type FeedEvent } from "../bus.js";
import { getSettings, setSettings, type DB } from "../db/db.js";
import { openFixPullRequest } from "../github/pr.js";
import { esc, type Markup, type Telegram } from "../telegram/api.js";
import { SENSITIVE } from "./gate.js";

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
  | "pr_open" // PR opened but auto-merge could not be turned on: the owner merges
  | "merging" // PR opened with auto-merge on: waits for the repository's checks
  | "applied" // in effect, being watched
  | "verified" // errors stopped: confirmed
  | "rolled_back" // errors did not drop: undone automatically
  | "undone" // undone by the owner or visitor
  | "failed"; // could not be applied (error in detail)

export const DEFAULT_POLICY: HealPolicy = { mode: "ask", after_min: 10, max_per_night: 2, flows: [] };
export const NIGHT_MS = 12 * 3_600_000;
export const SUSPEND_MS = 12 * 3_600_000;
/** Real apps: errors that still arrive this long after the fix went in count against it (deploy time). */
export const GRACE_MS = 10 * 60_000;
/** Real apps: a heal with no repeat of the error for this long after the grace period is confirmed. */
export const WATCH_MS = 30 * 60_000;
const SESSION_MAX = 3; // demo visitors: one per flow

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
 *   /heal off | /heal ask | /heal auto [10m] | /heal now [/route ...] | /heal max 2
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
      const m = (rest[0] ?? "10m").match(/^(\d{1,3})\s*(m|min|mins|minutes?)?$/i);
      const n = m ? Number(m[1]) : NaN;
      if (!Number.isInteger(n) || n < 3 || n > 240) return { error: "Give the minutes to wait, from 3 to 240: /heal auto 10m" };
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
      return { error: "Use /heal ask, /heal auto 10m, /heal now, /heal off or /heal max 2." };
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
  gate: { passed?: boolean; level?: string; test_run?: { verdict?: string } | null };
  files: string[];
  heals_last_night: number;
  now: number;
};

/** Why a fix may NOT be applied without a tap; null means it may. Pure: every rule is here. */
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
  }
  if (f.incident_status !== "open") return "the incident is no longer open";
  if (f.fix_status !== "shown") return f.fix_status === "rejected" ? "the fix was withheld by its checks" : `the fix is already ${f.fix_status}`;
  if (!f.gate.passed || f.gate.level !== "recommended") return f.gate.level === "caution" ? "the reviewer had concerns, so only you can apply it" : "only fixes that passed every check can be applied";
  const sensitive = f.files.find((x) => SENSITIVE.test(x));
  if (sensitive) return `it touches a protected area (${sensitive})`;
  if (f.kind === "sandbox" && f.gate.test_run?.verdict !== "proved") return "its regression test did not prove it";
  return null;
}

/** True when the errors after a heal did not fall to under half of the same stretch before it. */
export function notImproved(before: number, after: number): boolean {
  return after > 0 && after >= before * 0.5;
}

/** The opposite edits, for undoing a fix that was merged. */
export function reverseEdits(edits: Array<{ file: string; find: string; replace: string }>) {
  return edits.map((e) => ({ file: e.file, find: e.replace, replace: e.find })).reverse();
}

/** Write access for self-healing a real app: a token set on the server for that app only. */
export function writeTokenFor(project: { id: number; kind: string; repo: string | null }): string | null {
  if (!project.repo || project.repo.startsWith("local:") || project.kind !== "faurus") return null;
  // One token per app, set by hand on the server (JR_GITHUB_HEAL_TOKEN_<app id>), scoped by its owner to one repository.
  return process.env[`JR_GITHUB_HEAL_TOKEN_${project.id}`] || null;
}

// ---------- GitHub (injectable for tests) ----------

type Edit = { file: string; find: string; replace: string };
export type GitHubOps = {
  openPr(o: { repo: string; token: string; edits: Edit[]; branch: string; title: string; body: string; commitNote: string }): Promise<{ ok: true; url: string; number: number } | { ok: false; error: string }>;
  /** Turns on auto-merge; when the repository requires nothing, merges now. */
  autoMerge(repo: string, token: string, number: number): Promise<{ ok: true; merged: boolean } | { ok: false; error: string }>;
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

export const realGitHub: GitHubOps = {
  async openPr(o) {
    const out = await openFixPullRequest({ ...o });
    return out.ok ? { ok: true, url: out.url, number: out.number } : { ok: false, error: out.error };
  },
  async autoMerge(repo, token, number) {
    try {
      const pr = await gh<{ node_id: string }>(token, "GET", `https://api.github.com/repos/${repo}/pulls/${number}`);
      const q = `mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }`;
      const r = await gh<{ errors?: Array<{ message: string }> }>(token, "POST", "https://api.github.com/graphql", { query: q, variables: { id: pr.node_id } });
      if (!r.errors?.length) return { ok: true, merged: false };
      // GitHub refuses auto-merge when the pull request is already mergeable (no required checks):
      // merging now is exactly what auto-merge would do.
      if (r.errors.some((e) => /clean status/i.test(e.message))) {
        await gh(token, "PUT", `https://api.github.com/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash" });
        return { ok: true, merged: true };
      }
      return { ok: false, error: r.errors.map((e) => e.message).join("; ").slice(0, 200) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
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
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  fix_id      INTEGER NOT NULL REFERENCES fixes(id),
  session_id  TEXT,
  flow        TEXT,
  trigger     TEXT NOT NULL,
  status      TEXT NOT NULL,
  detail      TEXT,
  pr_url      TEXT,
  pr_number   INTEGER,
  hits_before INTEGER NOT NULL DEFAULT 0,
  applied_at  TEXT,
  ended_at    TEXT,
  log         TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS heals_incident ON heals(incident_id, id);
CREATE INDEX IF NOT EXISTS heals_project ON heals(project_id, created_at);
`;

export function ensureHealSchema(db: DB) {
  db.exec(SCHEMA);
}

export type HealRow = {
  id: number; project_id: number; incident_id: number; fix_id: number; session_id: string | null; flow: string | null; trigger: HealTrigger;
  status: HealStatus; detail: string | null; pr_url: string | null; pr_number: number | null; hits_before: number; applied_at: string | null;
  ended_at: string | null; log: string; created_at: string;
};

/** The demo portal's flows, keyed by the visitor's button. */
export const SANDBOX_FLOWS: Record<string, string> = { submit: "/api/submit", exam: "/api/exam/start", pay: "/api/pay" };

type FixInfo = {
  fix_id: number; status: string; gate_result: string; diff: string; result: string; incident_id: number; incident_status: string;
  exception_type: string; transaction_name: string | null; project_id: number; project_name: string; kind: "faurus" | "sandbox" | "paste"; repo: string | null;
};

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

  /** A demo visitor's choice for their own session: approve each fix, or heal on its own. */
  static setSessionMode(db: DB, session: string, auto: boolean) {
    db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`heal_session:${session}`, auto ? "auto-now" : "ask");
  }

  private sessionPolicy(session: string): HealPolicy {
    const v = (this.db.prepare("SELECT value FROM kv WHERE key = ?").get(`heal_session:${session}`) as { value: string } | undefined)?.value;
    return normalisePolicy({ mode: v === "auto-now" ? "auto-now" : "ask", max_per_night: SESSION_MAX });
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
    const counted = "('pr_open','merging','applied','verified','rolled_back','undone')";
    return session
      ? (this.db.prepare(`SELECT COUNT(*) AS n FROM heals WHERE session_id = ? AND status IN ${counted} AND created_at > ?`).get(session, since) as { n: number }).n
      : (this.db.prepare(`SELECT COUNT(*) AS n FROM heals WHERE project_id = ? AND session_id IS NULL AND status IN ${counted} AND created_at > ?`).get(projectId, since) as { n: number }).n;
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
      heals_last_night: this.healsSince(info.project_id, session, now - NIGHT_MS),
      now,
    });
    return { blocker, info, policy };
  }

  private insert(info: FixInfo, trigger: HealTrigger, status: HealStatus, detail: string | null, session: string | null, flow: string | null): number {
    const hitsBefore = this.eventsBetween(info.incident_id, Date.now() - WATCH_MS, Date.now());
    const now = new Date().toISOString();
    return Number(
      this.db
        .prepare("INSERT INTO heals (project_id, incident_id, fix_id, session_id, flow, trigger, status, detail, hits_before, log, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(info.project_id, info.incident_id, info.fix_id, session, flow, trigger, status, detail, hitsBefore, JSON.stringify([{ at: now, what: `${status}${detail ? `: ${detail}` : ""}` }]), now)
        .lastInsertRowid,
    );
  }

  private update(id: number, status: HealStatus, detail: string | null, extra: Partial<Pick<HealRow, "pr_url" | "pr_number" | "applied_at" | "ended_at">> = {}) {
    const row = this.get(id)!;
    const log = [...(JSON.parse(row.log) as unknown[]), { at: new Date().toISOString(), what: `${status}${detail ? `: ${detail}` : ""}` }];
    this.db
      .prepare(
        `UPDATE heals SET status = ?, detail = ?, pr_url = COALESCE(?, pr_url), pr_number = COALESCE(?, pr_number), applied_at = COALESCE(?, applied_at),
         ended_at = COALESCE(?, ended_at), log = ? WHERE id = ?`,
      )
      .run(status, detail, extra.pr_url ?? null, extra.pr_number ?? null, extra.applied_at ?? null, extra.ended_at ?? null, JSON.stringify(log), id);
  }

  get(id: number): HealRow | undefined {
    return this.db.prepare("SELECT * FROM heals WHERE id = ?").get(id) as HealRow | undefined;
  }

  latestFor(incidentId: number): HealRow | undefined {
    return this.db.prepare("SELECT * FROM heals WHERE incident_id = ? AND session_id IS NULL ORDER BY id DESC LIMIT 1").get(incidentId) as HealRow | undefined;
  }

  private eventsBetween(incidentId: number, fromMs: number, toMs: number): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM events WHERE incident_id = ? AND received_at > ? AND received_at <= ?")
        .get(incidentId, new Date(fromMs).toISOString(), new Date(toMs).toISOString()) as { n: number }
    ).n;
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
      // It did not help: undo at once, and say the owner is woken.
      this.db.prepare("DELETE FROM session_fixes WHERE session_id = ? AND flow = ?").run(session, flow);
      this.update(id, "rolled_back", status ? `the request still failed (${status})` : "the fixed build did not answer", { ended_at: new Date().toISOString() });
      this.feed(session, "heal", info.incident_id, { heal_id: id, status: "rolled_back", fix_id: fixId, flow, reason: "the request still failed after the fix, so it was rolled back; the owner keeps the alert" });
    }
    return this.get(id)!;
  }

  /** A demo visitor's Undo: their session goes back to the broken build. */
  undoSession(healId: number, session: string): boolean {
    const h = this.get(healId);
    if (!h || h.session_id !== session || !h.flow || !["applied", "verified"].includes(h.status)) return false;
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
    const by = trigger === "owner" ? "approved by the owner on Telegram" : trigger === "auto-after" ? "applied on its own: the owner did not answer the wake-up, and their heal rule allows it" : "applied on its own under the owner's heal rule";
    const pr = await this.github.openPr({
      repo: info.repo,
      token,
      edits: r.edits,
      branch: `jr/heal-${id}-${Date.now().toString(36)}`,
      title: `Fix ${what} (JaagteRaho)`,
      body: [`**Cause, in plain words:** ${r.cause_plain}`, "", `**Technical:** ${r.cause_technical}`, "", `**How to check:** ${r.test_hint}`, "", `AI-written fix that passed JaagteRaho's six code checks and review; ${by}. Merges only when this repository's own checks pass.`].join("\n"),
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
    const merge = await this.github.autoMerge(info.repo, token, pr.number);
    if (!merge.ok) {
      this.update(id, "pr_open", `auto-merge is not allowed: ${merge.error}`, { pr_url: pr.url, pr_number: pr.number });
      if (trigger !== "owner") this.keepPaging(info.incident_id);
      await this.tell(info.project_id, `<b>Fix ready as a pull request</b> · ${esc(info.project_name)}: ${esc(pr.url)}\nAuto-merge is off on this repository, so merge it yourself to heal. ${trigger === "owner" ? "" : "Still paging you."}`, this.undoMarkup(id));
      return this.get(id)!;
    }
    if (merge.merged) {
      this.update(id, "applied", "merged (no checks were required)", { pr_url: pr.url, pr_number: pr.number, applied_at: new Date().toISOString() });
      await this.reportApplied(id);
    } else {
      this.update(id, "merging", "auto-merge on: merges when the repository's checks pass", { pr_url: pr.url, pr_number: pr.number });
      await this.tell(info.project_id, `<b>Healing ${esc(info.project_name)}</b>: pull request ${esc(pr.url)} merges on its own when your checks pass. Then I watch the errors.`, this.undoMarkup(id));
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
        `<b>Proof:</b> watching for ${Math.round((GRACE_MS + WATCH_MS) / 60_000)} min. If the error does not drop, I undo it and wake you again.`,
      ].join("\n"),
      this.undoMarkup(healId),
    );
  }

  /** Undo by the owner (or automatically when a heal did not help). */
  async undo(healId: number, why: "owner" | "no improvement"): Promise<string> {
    const h = this.get(healId);
    if (!h || h.session_id) return "Not found.";
    if (!["pr_open", "merging", "applied", "verified"].includes(h.status)) return `Nothing to undo: ${h.status.replace("_", " ")}.`;
    const info = this.fixInfo(h.fix_id)!;
    const token = writeTokenFor({ id: info.project_id, kind: info.kind, repo: info.repo });
    if (!token || !info.repo || !h.pr_number) return "No write access to undo it; revert the pull request on GitHub.";
    const label = why === "owner" ? "undone by the owner" : "rolled back: the errors did not drop";
    const st = await this.github.state(info.repo, token, h.pr_number);
    if (st && !st.merged_at) {
      await this.github.close(info.repo, token, h.pr_number);
    } else {
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
      if (!rev.ok) {
        this.update(healId, h.status, `undo failed: ${rev.error}`);
        return `Could not open the undo pull request: ${rev.error}`;
      }
      const m = await this.github.autoMerge(info.repo, token, rev.number);
      this.update(healId, why === "owner" ? "undone" : "rolled_back", `${label} · ${rev.url}${m.ok ? "" : " (merge it yourself)"}`, { ended_at: new Date().toISOString() });
      return `Undo pull request ${rev.url}${m.ok ? (m.merged ? " merged." : " merges when your checks pass.") : ". Merge it to finish."}`;
    }
    this.db.prepare("UPDATE fixes SET status = 'shown' WHERE id = ? AND status = 'approved'").run(h.fix_id);
    this.update(healId, why === "owner" ? "undone" : "rolled_back", `${label} · pull request closed before it merged`, { ended_at: new Date().toISOString() });
    return "Closed the pull request before it merged. Nothing changed in your code.";
  }

  /** Every 30 seconds: unanswered wake-ups past the owner's wait, merges to follow, heals to confirm or roll back. */
  async tick(now = Date.now()) {
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

    // 2. Pull requests waiting for auto-merge.
    const merging = this.db.prepare("SELECT id FROM heals WHERE status IN ('merging', 'pr_open') AND session_id IS NULL").all() as Array<{ id: number }>;
    for (const { id } of merging) {
      const h = this.get(id)!;
      const info = this.fixInfo(h.fix_id)!;
      const token = writeTokenFor({ id: info.project_id, kind: info.kind, repo: info.repo });
      if (!token || !info.repo || !h.pr_number) continue;
      const st = await this.github.state(info.repo, token, h.pr_number);
      if (st?.merged_at) {
        this.update(id, "applied", "merged", { applied_at: st.merged_at });
        await this.reportApplied(id);
      } else if (st && st.state === "closed") {
        this.db.prepare("UPDATE fixes SET status = 'shown' WHERE id = ? AND status = 'approved'").run(h.fix_id);
        this.update(id, "undone", "the pull request was closed without merging", { ended_at: new Date().toISOString() });
      }
    }

    // 3. Applied heals: confirm, or roll back and wake the owner again.
    const applied = this.db.prepare("SELECT id FROM heals WHERE status = 'applied' AND session_id IS NULL").all() as Array<{ id: number }>;
    for (const { id } of applied) {
      const h = this.get(id)!;
      const t0 = Date.parse(h.applied_at!) + GRACE_MS;
      if (now < t0) continue;
      const after = this.eventsBetween(h.incident_id, t0, Math.min(now, t0 + WATCH_MS));
      const beforeSameStretch = h.hits_before * (Math.min(now - t0, WATCH_MS) / WATCH_MS);
      if (notImproved(beforeSameStretch, after)) {
        const msg = await this.undo(id, "no improvement");
        savePolicy(this.db, h.project_id, { suspended_until: new Date(now + SUSPEND_MS).toISOString(), suspended_reason: "a heal did not bring the errors down" });
        this.keepPaging(h.incident_id);
        const info = this.fixInfo(h.fix_id)!;
        await this.tell(
          h.project_id,
          `🔴 <b>WAKE · the heal did not help</b> · ${esc(info.project_name)}\n${esc(info.exception_type)} came back ${after} times after the fix went in. ${esc(msg)}\nSelf-healing is paused for 12 hours. /heal to change it.`,
        );
      } else if (now >= t0 + WATCH_MS) {
        this.update(id, "verified", `no repeat of the error in ${WATCH_MS / 60_000} min after the fix went in`, { ended_at: new Date(now).toISOString() });
        const info = this.fixInfo(h.fix_id)!;
        this.db.prepare("UPDATE fixes SET status = 'merged' WHERE id = ?").run(h.fix_id);
        await this.tell(h.project_id, `✅ <b>Heal confirmed</b> · ${esc(info.project_name)}: no ${esc(info.exception_type)} in the ${WATCH_MS / 60_000} min after the fix went in.`, this.undoMarkup(id));
      }
    }
  }
}

/** One line for the alert card. */
export function healLine(h: HealRow | undefined): string | null {
  if (!h) return null;
  switch (h.status) {
    case "skipped":
      return `<b>Self-heal:</b> not on its own (${esc(h.detail ?? "")})`;
    case "diff_sent":
      return "<b>Self-heal:</b> no write access, diff sent to you";
    case "pr_open":
      return `<b>Self-heal:</b> pull request open, merge it to heal${h.pr_url ? ` · <a href="${esc(h.pr_url)}">PR</a>` : ""}`;
    case "merging":
      return `<b>Self-heal:</b> merging when your checks pass${h.pr_url ? ` · <a href="${esc(h.pr_url)}">PR</a>` : ""}`;
    case "applied":
      return "<b>Self-heal:</b> fix in, watching the errors";
    case "verified":
      return "<b>Self-heal:</b> healed, confirmed ✅";
    case "rolled_back":
      return "<b>Self-heal:</b> rolled back, it did not help";
    case "undone":
      return "<b>Self-heal:</b> undone";
    case "failed":
      return `<b>Self-heal:</b> failed (${esc(h.detail ?? "")})`;
    default:
      return null;
  }
}
