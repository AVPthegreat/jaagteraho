// The Playground: a visitor picks one of the JR-Bench sample apps and watches JaagteRaho handle a real
// bug in it, live. A ticker plants one of OUR bench cases into a fresh temp copy of the app, runs it so it
// crashes for real, and pushes the real traceback through the real pipeline, exactly as JR-Bench does:
//   decision -> diagnosis -> fix gate -> the model's own regression test (proveFix) -> OUR hidden test.
// Each step is streamed to viewers with its time and cost, and the finished run is stored with a scorecard.
//
// Safety: nothing a visitor sends reaches code, paths or the model except the app's name, checked against
// the list. Runs are charged to their own "playground" spend lane (its own daily $ cap and diagnosis count, fenced off so it can
// never use up what Faurus or the exam portal demo may spend); when a cap is reached the
// playground replays real past runs, clearly marked, and never makes up a result. The playground never
// alerts anyone: it does not use the worker (which owns Telegram and phone calls), its queued job is removed
// in the same synchronous step that stores the event, and the worker skips playground apps anyway.

import { randomBytes, randomInt } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { spendContext, type AI } from "../ai/claude.js";
import { getSettings, setSettings, type DB } from "../db/db.js";
import type { CleanEvent } from "../intake/allowlist.js";
import { storeEvent } from "../intake/store.js";
import { decide as realDecide, severityWord, type Decision } from "../pipeline/decide.js";
import { gatherFiles, runDiagnosis, type DiagnosisOutput, type DiagnosisResult, type SourceFile } from "../pipeline/diagnose.js";
import { codeChecks, riskyAdditions, runGate, type GateResult } from "../pipeline/gate.js";
import { proveFix, riskyFixLines, type TestRun } from "../pipeline/verify.js";
import { DAILY_DIAGNOSES } from "../pipeline/worker.js";
import { LocalSource } from "../source/source.js";
import { parseTraceback } from "../web/paste.js";
import { envInt } from "../envint.js";
import { playgroundBus, type PlaygroundEvent, type PlaygroundStep } from "./events.js";
import { runJob } from "../runner/client.js";
import type { Base } from "../runner/exec.js";
import { benchDir, copyApp, crashReport, describeApps, isNodeApp, loadBench, removeDir, type AppInfo, type Bench, type BenchCase } from "./sandbox.js";

export const PLAYGROUND_SCHEMA = `
CREATE TABLE IF NOT EXISTS playground_runs (
  id          INTEGER PRIMARY KEY,
  app         TEXT NOT NULL,
  case_id     TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  scorecard   TEXT,
  events      TEXT NOT NULL DEFAULT '[]',
  cost_usd    REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS playground_runs_app ON playground_runs(app, id);
CREATE INDEX IF NOT EXISTS playground_runs_done ON playground_runs(status, id);
`;

export type Scorecard = {
  run_id: number;
  app: string;
  case_id: string;
  case_source: "benchmark" | "playground";
  planted: { story: string; files: string[] };
  error: string;
  where: string | null; // file:line of the crash (top app frame)
  route: string | null;
  decision: string;
  decision_rule: string;
  cause_plain: string | null;
  named: string | null; // file:line the diagnosis named
  right_file: boolean | null;
  gate: string; // recommended | caution | withheld | no fix
  gate_reasons: string[];
  own_test: TestRun["verdict"] | "skipped";
  hidden_test: "passed" | "failed" | "not_run";
  seconds_to_cause: number | null;
  seconds_to_proved_fix: number | null;
  total_seconds: number;
  cost_usd: number;
  finished_at: string;
  applied_by?: "approved" | "healed"; // a visitor's own run: how the fix went in
};

/** The model-facing steps. Production uses the real pipeline; tests pass fakes (no network, no spend). */
export type Steps = {
  decide: (db: DB, ai: AI | null, ctx: Parameters<typeof realDecide>[2]) => Promise<Decision>;
  diagnose: (ai: AI | null, ev: CleanEvent, files: SourceFile[]) => Promise<DiagnosisOutput | { error: string }>;
  gate: (ai: AI | null, d: DiagnosisResult, files: SourceFile[]) => Promise<GateResult>;
};

export const realSteps: Steps = {
  decide: (db, ai, ctx) => realDecide(db, ai, ctx, false),
  diagnose: (ai, ev, files) => (ai ? runDiagnosis(ai, ev, files, false) : Promise.resolve({ error: "no model key" })),
  gate: (ai, d, files) => runGate(ai, d, files),
};

export type PlaygroundOptions = {
  steps?: Steps;
  dir?: string;
  /** True when a live run may spend: the demo lane and total caps (default: checked on the AI's spend guard). */
  canSpend?: () => boolean;
  everyMs?: number; // per watched app
  idleMs?: number; // across all apps when nobody watches
  maxConcurrent?: number;
  runsPerHour?: number; // live runs per hour, all apps together
  tickMs?: number;
};

/** What a visitor chose for their own run: the bug, the time of day, and the heal rule. */
export type OwnChoice = { session: string; caseId: string; exam: boolean; heal: "ask" | "auto" };

/** A visitor's own run, kept in memory so only that visitor can use the app, approve, heal or undo it. */
type Own = {
  runId: number;
  session: string;
  app: string;
  c: BenchCase;
  heal: "ask" | "auto";
  exam: boolean;
  runFrom: Base;
  state: "running" | "broken" | "fixed";
  patched: Record<string, string> | null;
  approvable: boolean;
  proved: boolean;
  busy: boolean;
  card: Scorecard | null;
  events: PlaygroundEvent[];
  emit: (step: PlaygroundStep, data: Record<string, unknown>) => void;
  until: number;
};

const OWN_TTL_MS = 30 * 60_000;
/** "Use the app" jobs running at once across all visitors (the runner also has its own small queue). */
export const USE_AT_ONCE = 2;
const WATCH_TTL_MS = 90_000;
const OPEN_GAP_MS = 15_000;
const EVENTS_PER_RUN = 40;

export class Playground {
  readonly bench: Bench;
  readonly apps: AppInfo[];
  private dir: string;
  private steps: Steps;
  private everyMs: number;
  private idleMs: number;
  private maxConcurrent: number;
  private runsPerHour: number;
  private tickMs: number;
  private inflight = new Map<string, Promise<Scorecard | null>>();
  /** Events of each app's current run, so a viewer who joins mid-run sees it from the start. */
  private current = new Map<string, PlaygroundEvent[]>();
  private replaying = new Set<string>();
  private lastStart = new Map<string, number>();
  private lastAny = 0;
  private liveStarts: number[] = [];
  private watchers = new Map<string, Map<string, number>>(); // app -> session -> last seen
  private openFeeds = new Map<string, number>(); // app -> open live feeds
  private nextCase = new Map<string, number>();
  private own = new Map<number, Own>();
  private usesInFlight = 0;
  /** One-time tickets for the visitor's live feed, so the session id never travels in a URL. */
  private tickets = new Map<string, { session: string; until: number }>();
  private titles: Record<string, { title: string; symptom: string; action: string }> = {};
  private ownBySession = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private db: DB,
    private ai: AI | null,
    opts: PlaygroundOptions = {},
  ) {
    db.exec(PLAYGROUND_SCHEMA);
    // A crash mid-run leaves a 'running' row: it never finished, so it is not a result.
    db.prepare("UPDATE playground_runs SET status = 'failed' WHERE status = 'running'").run();
    // Readable copies left by a crash mid-run.
    try {
      for (const name of readdirSync(tmpdir())) if (name.startsWith("jrplay-")) rmSync(join(tmpdir(), name), { recursive: true, force: true });
    } catch {
      // a temp folder we cannot list holds nothing of ours
    }
    this.dir = opts.dir ?? benchDir();
    this.bench = loadBench(this.dir);
    this.apps = describeApps(this.bench, this.dir).filter((a) => a.bugs > 0);
    try {
      this.titles = JSON.parse(readFileSync(join(this.dir, "playground-titles.json"), "utf8"));
    } catch {
      this.titles = {};
    }
    this.steps = opts.steps ?? realSteps;
    this.canSpendOpt = opts.canSpend;
    this.everyMs = opts.everyMs ?? envInt("JR_PLAYGROUND_EVERY_SEC", 60, 20, 3600) * 1000;
    this.idleMs = opts.idleMs ?? envInt("JR_PLAYGROUND_IDLE_MIN", 10, 1, 1440) * 60_000;
    this.maxConcurrent = opts.maxConcurrent ?? 3;
    this.runsPerHour = opts.runsPerHour ?? envInt("JR_PLAYGROUND_RUNS_PER_HOUR", 120, 1, 600);
    this.tickMs = opts.tickMs ?? 5_000;
    for (const a of this.apps) this.nextCase.set(a.name, randomInt(0, 1000));
  }

  private canSpendOpt?: () => boolean;

  hasApp(name: unknown): name is string {
    return typeof name === "string" && this.apps.some((a) => a.name === name);
  }

  /** Whether a live run may spend now: a model key, the demo lane's $ cap, the total caps, the demo's diagnosis count. */
  canSpend(): boolean {
    if (this.canSpendOpt) return this.canSpendOpt();
    if (!this.ai) return false;
    return spendContext.run({ projectId: 0, lane: "playground" }, () => {
      const g = this.ai!.guard;
      return g.pick(this.ai!.diagnosisModel, this.ai!.decisionModel) !== null && g.countToday("diagnosis", "playground") < DAILY_DIAGNOSES.playground;
    });
  }

  start() {
    this.stopped = false;
    this.timer = setInterval(() => void this.tick().catch((e) => console.error("playground tick:", e)), this.tickMs);
    this.timer.unref();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---- who is watching -------------------------------------------------------------------------

  watch(session: string, app: string, now = Date.now()) {
    for (const [a, m] of this.watchers) if (a !== app) m.delete(session);
    const m = this.watchers.get(app) ?? new Map<string, number>();
    m.set(session, now);
    this.watchers.set(app, m);
  }

  feedOpened(app: string) {
    this.openFeeds.set(app, (this.openFeeds.get(app) ?? 0) + 1);
  }

  feedClosed(app: string) {
    this.openFeeds.set(app, Math.max(0, (this.openFeeds.get(app) ?? 0) - 1));
  }

  watching(app: string, now = Date.now()): number {
    const m = this.watchers.get(app);
    if (m) for (const [s, at] of m) if (now - at > WATCH_TTL_MS) m.delete(s);
    return Math.max(m?.size ?? 0, this.openFeeds.get(app) ?? 0);
  }

  isRunning(app: string) {
    return this.inflight.has(app) || this.replaying.has(app);
  }

  /** When this app's next bug is planted, if someone is watching it. */
  nextAt(app: string, now = Date.now()): number | null {
    if (this.isRunning(app)) return null;
    const last = this.lastStart.get(app);
    return last === undefined ? now : Math.max(now, last + this.everyMs);
  }

  /** Where the app is now, for a viewer who just arrived. */
  snapshot(app: string) {
    return {
      app,
      running: this.isRunning(app),
      events: this.current.get(app) ?? [],
      last: this.latest(1, app)[0] ?? null,
      next_at: this.nextAt(app) ? new Date(this.nextAt(app)!).toISOString() : null,
      every_seconds: Math.round(this.everyMs / 1000),
      live: this.canSpend(),
    };
  }

  // ---- scheduling ------------------------------------------------------------------------------

  /** Starts a run for this app now if none is running and the limits allow; returns whether one started. */
  startNow(app: string, now = Date.now(), opened = false): "live" | "replay" | null {
    if (!this.hasApp(app) || this.stopped || this.isRunning(app)) return null;
    const last = this.lastStart.get(app);
    // A visitor who just opened an app gets a run at once (unless one started in the last few seconds);
    // after that, one every everyMs while anyone watches.
    if (last !== undefined && now - last < (opened ? OPEN_GAP_MS : this.everyMs)) return null;
    if (this.inflight.size + this.replaying.size >= this.maxConcurrent) return null;
    this.lastStart.set(app, now);
    this.lastAny = now;
    this.liveStarts = this.liveStarts.filter((t) => now - t < 3_600_000);
    if (this.canSpend() && this.liveStarts.length < this.runsPerHour) {
      this.liveStarts.push(now);
      const p = this.runLive(app).finally(() => this.inflight.delete(app));
      this.inflight.set(app, p);
      return "live";
    }
    return this.replay(app) ? "replay" : null;
  }

  async tick(now = Date.now()) {
    if (this.stopped) return;
    this.sweepOwn(now);
    let watched = false;
    for (const a of this.apps) {
      if (this.watching(a.name, now) === 0) continue;
      watched = true;
      this.startNow(a.name, now);
    }
    // Nobody watching: one live run every idle period, round the apps, so the home strip stays fresh.
    // Never a replay here: replays are only for people watching.
    if (!watched && now - this.lastAny >= this.idleMs && this.inflight.size === 0 && this.canSpend()) {
      const last = this.db.prepare("SELECT app FROM playground_runs ORDER BY id DESC LIMIT 1").get() as { app: string } | undefined;
      const i = last ? this.apps.findIndex((a) => a.name === last.app) : -1;
      this.lastAny = now;
      this.startNow(this.apps[(i + 1) % this.apps.length].name, now);
    }
  }

  /** Waits for every run in flight (tests and shutdown). */
  async settle() {
    while (this.inflight.size) await Promise.all([...this.inflight.values()]);
  }

  // ---- results ---------------------------------------------------------------------------------

  latest(n = 10, app?: string): Scorecard[] {
    const rows = (
      app
        ? this.db.prepare("SELECT scorecard FROM playground_runs WHERE status = 'done' AND app = ? ORDER BY id DESC LIMIT ?").all(app, n)
        : this.db.prepare("SELECT scorecard FROM playground_runs WHERE status = 'done' ORDER BY id DESC LIMIT ?").all(n)
    ) as Array<{ scorecard: string }>;
    return rows.map((r) => JSON.parse(r.scorecard) as Scorecard);
  }

  stats() {
    const r = this.db
      .prepare(
        `SELECT COUNT(*) AS runs,
                SUM(CASE WHEN json_extract(scorecard, '$.right_file') = 1 THEN 1 ELSE 0 END) AS right_file,
                SUM(CASE WHEN json_extract(scorecard, '$.hidden_test') = 'passed' THEN 1 ELSE 0 END) AS hidden_passed,
                AVG(cost_usd) AS avg_cost
         FROM playground_runs WHERE status = 'done'`,
      )
      .get() as { runs: number; right_file: number | null; hidden_passed: number | null; avg_cost: number | null };
    return { runs: r.runs, right_file: r.right_file ?? 0, hidden_passed: r.hidden_passed ?? 0, avg_cost_usd: Math.round((r.avg_cost ?? 0) * 10000) / 10000 };
  }

  // ---- one run ---------------------------------------------------------------------------------

  private pickCase(app: string): BenchCase {
    const cases = this.bench.cases.filter((c) => c.app === app && c.kind === "bug");
    const n = this.nextCase.get(app) ?? 0;
    this.nextCase.set(app, n + 1);
    return cases[n % cases.length];
  }

  /** The app's playground record: kind 'sandbox', spend lane "playground", never linked to an owner. */
  private projectFor(app: string): number {
    const name = `playground-${app}`;
    const row = this.db.prepare("SELECT id FROM projects WHERE name = ?").get(name) as { id: number } | undefined;
    if (row) return row.id;
    const id = randomInt(1_000_000, 9_999_999);
    this.db
      .prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (?, ?, ?, 'sandbox', NULL, 'read', ?, ?)")
      .run(id, name, randomBytes(16).toString("hex"), JSON.stringify({ playground: true, critical: this.bench.apps[app].critical }), new Date().toISOString());
    return id;
  }

  /**
   * Each run is a new app's first crash: the previous run's incident and events are cleared (the scorecard
   * keeps the result), and the queued job storeEvent adds is removed at once, so the worker never sees it.
   */
  private storeCrash(projectId: number, ev: CleanEvent): number | null {
    return this.db.transaction(() => {
      this.db.prepare("DELETE FROM jobs WHERE incident_id IN (SELECT id FROM incidents WHERE project_id = ?)").run(projectId);
      this.db.prepare("DELETE FROM decisions WHERE incident_id IN (SELECT id FROM incidents WHERE project_id = ?)").run(projectId);
      this.db.prepare("DELETE FROM events WHERE project_id = ?").run(projectId);
      this.db.prepare("DELETE FROM incidents WHERE project_id = ?").run(projectId);
      const stored = storeEvent(this.db, projectId, ev);
      if (!stored.stored) return null;
      this.db.prepare("DELETE FROM jobs WHERE incident_id = ?").run(stored.incidentId);
      return stored.incidentId;
    })();
  }

  private spentBy(projectId: number, since: string): number {
    return (this.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend WHERE project_id = ? AND at >= ?").get(projectId, since) as { t: number }).t;
  }

  private async runLive(app: string, mine?: Own): Promise<Scorecard | null> {
    const c = mine?.c ?? this.pickCase(app);
    const startedAt = new Date().toISOString();
    const runId = mine?.runId ?? Number(this.db.prepare("INSERT INTO playground_runs (app, case_id, started_at, status) VALUES (?, ?, ?, 'running')").run(app, c.id, startedAt).lastInsertRowid);
    const t0 = Date.now();
    const events: PlaygroundEvent[] = mine?.events ?? [];
    if (!mine) this.current.set(app, events);
    const emit = (step: PlaygroundStep, data: Record<string, unknown>) => {
      const ev: PlaygroundEvent = { step, app, run_id: runId, at: new Date().toISOString(), t: Math.round((Date.now() - t0) / 100) / 10, data };
      if (events.length < EVENTS_PER_RUN) events.push(ev);
      playgroundBus.send(ev, mine?.session);
    };
    if (mine) mine.emit = emit;
    const projectId = this.projectFor(app);
    const dirs: string[] = [];
    try {
      return await spendContext.run({ projectId, lane: "playground" }, async () => {
        emit("plant", { case_id: c.id, app, files: this.apps.find((a) => a.name === app)?.files ?? 0 });
        // A readable copy here (for the diagnosis to read, never run); the crash itself happens in the isolated runner.
        const broken = await copyApp(this.dir, app, c.inject ?? []);
        dirs.push(broken);
        const runFrom: Base = { kind: "bench", app, edits: c.inject ?? [], dir: this.dir };
        if (mine) mine.runFrom = runFrom;
        const ran = await runJob({ kind: "trigger", base: runFrom, code: c.trigger! });
        if (ran.kind !== "trigger") throw new Error("unexpected runner answer");
        // The runner's paths, mapped onto the readable copy, so frames point at files the diagnosis can read.
        const tb = crashReport(isNodeApp(broken), ran.stderr.replaceAll(`${ran.dir}${sep}`, `${broken}${sep}`));
        const parsed = tb ? parseTraceback(tb) : null;
        if (ran.status === 0 || !parsed) throw new Error("the planted bug did not crash the app");
        const top = [...parsed.frames].reverse().find((f) => f.in_app && (f.abs_path ?? "").startsWith(broken + sep)) ?? null;
        const where = top ? `${top.abs_path!.slice(broken.length + 1)}:${top.lineno}` : null;
        // Viewers see paths inside the app, not our temp folder.
        const shownTb = tb.replaceAll(`${broken}${sep}`, "");
        const tCrash = Date.now();
        emit("crash", { traceback: shownTb.slice(-4000), exception_type: parsed.exception_type, message: parsed.message.slice(0, 300), route: c.route, where });

        const appCfg = this.bench.apps[app];
        // A visitor's own run uses the time of day they chose (an exam or peak hour is the critical window).
        const examOn = mine ? mine.exam : appCfg.exam_open === true;
        setSettings(this.db, projectId, { critical: appCfg.critical, exam_until: examOn ? new Date(Date.now() + 3_600_000).toISOString() : null });
        const ev: CleanEvent = {
          event_id: randomBytes(16).toString("hex"),
          timestamp: new Date().toISOString(),
          level: "error",
          platform: isNodeApp(broken) ? "node" : "python",
          release: null,
          environment: "production",
          transaction: c.route,
          exception_type: parsed.exception_type,
          message: parsed.message,
          chain: [],
          frames: parsed.frames,
          tags: {},
          sdk: "jr-playground",
        };
        const incidentId = this.storeCrash(projectId, ev);
        if (incidentId === null) throw new Error("could not store the crash");
        emit("connected", { note: "JaagteRaho received the error report" });

        const decision = await this.steps.decide(this.db, this.ai, { incidentId, projectId, projectName: app, change: "new", status: "open", hits: 1, event: ev });
        emit("decision", {
          action: decision.action,
          rule: decision.rule,
          rule_text: decision.rule_text,
          engine: decision.engine,
          severity_word: decision.votes.severity ? severityWord(decision.votes.severity.value) : null,
          sandbox_note: decision.action === "wake" ? "On a real app this rings the owner. The playground never calls or messages anyone." : null,
          exam_window: examOn,
          critical: decision.facts.critical,
        });

        const { files } = await gatherFiles(this.db, new LocalSource(broken), projectId, parsed.frames, null);
        const out = await this.steps.diagnose(this.ai, ev, files);
        const tCause = Date.now();
        const injected = (c.inject ?? []).map((e) => e.file);
        const sameFile = (n: string) => injected.some((f) => f === n || f.endsWith(`/${n}`) || n.endsWith(`/${f}`));
        let named: string | null = null;
        let rightFile: boolean | null = null;
        let causePlain: string | null = null;
        let gateLevel = "no fix";
        let gateReasons: string[] = [];
        let ownTest: Scorecard["own_test"] = "skipped";
        let hidden: Scorecard["hidden_test"] = "not_run";
        let tProved: number | null = null;
        if ("error" in out) {
          if (mine) emit("ready", { approvable: false, heal: mine.heal, reason: "The diagnosis could not finish, so there is no fix to apply." });
          // The reason stays in our log; viewers get a plain sentence, never a raw SDK message.
          console.error(`playground ${app} diagnosis:`, out.error);
          emit("cause", { unavailable: "The diagnosis could not finish this time." });
        } else {
          const d = out.result;
          named = `${d.file}:${d.line}`;
          rightFile = [d.file, ...d.edits.map((e) => e.file)].some(sameFile);
          causePlain = d.cause_plain;
          emit("cause", {
            cause_plain: d.cause_plain,
            cause_technical: d.cause_technical,
            file: d.file,
            line: d.line,
            confidence: d.confidence_words,
            model: out.model,
            seconds: Math.round((tCause - tCrash) / 100) / 10,
          });
          const shown = [...files, ...out.files_read];
          const rules = codeChecks(d, shown);
          const gate = await this.steps.gate(this.ai, d, shown);
          gateLevel = gate.level ?? (gate.passed ? "recommended" : "withheld");
          gateReasons = gate.reasons;
          emit("gate", {
            level: gateLevel,
            reasons: gate.reasons,
            diff: gate.diff.slice(0, 6000),
            changed_lines: gate.changed_lines,
            code_rules: rules.passed ? "passed" : "failed",
            code_rule_reasons: rules.reasons,
            reviewer: gate.review ? { fix_quality: gate.review.fix_quality, could_break: gate.review.could_break, touches_sensitive: gate.review.touches_sensitive } : null,
          });
          if (Object.keys(gate.patched).length) {
            // The model's own test: fails on the broken code, passes on the fixed code (Python only).
            const proof = await proveFix(broken, gate.patched, d.regression_test, runFrom);
            ownTest = proof.verdict;
            if (proof.verdict === "proved") tProved = Date.now();
            emit("own_test", { verdict: proof.verdict, before: proof.before ?? null, after: proof.after ?? null, note: proof.note });
            // Our hidden test (the model never saw it) on the patched copy, unless the fix reaches outside the program.
            const outside = this.reachesOutside(broken, gate.patched, d);
            if (mine) {
              // The visitor decides: the hidden test runs when the fix is applied (approved or healed).
              mine.patched = outside ? null : gate.patched;
              mine.approvable = !outside && gateLevel === "recommended";
              mine.proved = proof.verdict === "proved";
              emit("ready", {
                approvable: mine.approvable,
                heal: mine.heal,
                reason: outside
                  ? "The fix reaches outside the program, so it is never applied."
                  : gateLevel !== "recommended"
                    ? `The gate did not recommend this fix (${gateLevel}${gate.reasons.length ? `: ${gate.reasons[0]}` : ""}), so it cannot be applied.`
                    : null,
              });
            } else if (outside) {
              emit("hidden_test", { result: "not_run", note: `Not run: the fix adds code that reaches outside the program (${outside.slice(0, 60)}).` });
            } else {
              const ans = await runJob({ kind: "hidden", base: runFrom, patched: gate.patched, test: c.test! });
              const r = ans.kind === "hidden" ? ans.outcome : "error";
              hidden = r === "passed" ? "passed" : r === "failed" ? "failed" : "not_run";
              emit("hidden_test", { result: hidden, note: r === "error" ? "Our hidden test could not run on the patched code." : null });
            }
          } else {
            emit("own_test", { verdict: "skipped", note: "No edit to test." });
            if (mine) emit("ready", { approvable: false, heal: mine.heal, reason: "There is no fix to apply." });
          }
        }
        const cost = Math.round(this.spentBy(projectId, startedAt) * 10000) / 10000;
        const card: Scorecard = {
          run_id: runId,
          app,
          case_id: c.id,
          case_source: c.source ?? "benchmark",
          planted: { story: c.story, files: injected },
          error: `${parsed.exception_type}: ${parsed.message}`.slice(0, 160),
          where,
          route: c.route,
          decision: decision.action,
          decision_rule: decision.rule_text,
          cause_plain: causePlain,
          named,
          right_file: rightFile,
          gate: gateLevel,
          gate_reasons: gateReasons,
          own_test: ownTest,
          hidden_test: hidden,
          seconds_to_cause: "error" in out ? null : Math.round((tCause - tCrash) / 100) / 10,
          seconds_to_proved_fix: tProved ? Math.round((tProved - tCrash) / 100) / 10 : null,
          total_seconds: Math.round((Date.now() - tCrash) / 100) / 10,
          cost_usd: cost,
          finished_at: new Date().toISOString(),
        };
        emit("done", { scorecard: card, next_in_seconds: Math.round(this.everyMs / 1000) - Math.round((Date.now() - t0) / 1000) });
        this.db
          .prepare("UPDATE playground_runs SET status = 'done', finished_at = ?, scorecard = ?, events = ?, cost_usd = ? WHERE id = ?")
          .run(card.finished_at, JSON.stringify(card), JSON.stringify(events), cost, runId);
        if (mine) {
          mine.card = card;
          mine.state = "broken";
          // "Heal on its own": only a recommended fix that its own test proved, as with real heal rules.
          if (mine.heal === "auto") {
            if (mine.approvable && mine.proved) await this.applyFix(mine, "healed");
            else if (mine.approvable) emit("note", { text: "Not healed on its own: its own test did not prove the fix. You can still approve it." });
          }
        }
        return card;
      });
    } catch (e) {
      console.error(`playground ${app}:`, e);
      emit("failed", { note: mine ? "This run could not finish. Plant another bug to try again." : "This run could not finish. The next bug is planted on schedule." });
      if (mine) mine.state = "broken";
      this.db.prepare("UPDATE playground_runs SET status = 'failed', finished_at = ?, events = ?, cost_usd = ? WHERE id = ?").run(
        new Date().toISOString(),
        JSON.stringify(events),
        this.spentBy(projectId, startedAt),
        runId,
      );
      return null;
    } finally {
      if (!mine) this.current.delete(app);
      for (const d of dirs) await removeDir(d).catch(() => undefined);
    }
  }

  // ---- a visitor's own run -----------------------------------------------------------------------

  /** The bugs a visitor can pick for an app (only these ids are ever accepted). */
  casesFor(app: string) {
    return this.bench.cases.filter((c) => c.app === app && c.kind === "bug");
  }

  /** What the visitor sees of each bug: a plain title, the symptom and the action that hits it (bench/playground-titles.json). */
  caseList(app: string) {
    return this.casesFor(app).map((c) => {
      const t = this.titles[c.id];
      return { id: c.id, title: t?.title ?? c.story, symptom: t?.symptom ?? c.story, action: t?.action ?? `Call ${c.route ?? "the app"}`, route: c.route, source: c.source ?? "benchmark" };
    });
  }

  /**
   * Plants the bug the visitor picked (or a random one) in their own copy of the app. Only listed apps and
   * cases are accepted; one own run at a time per visitor; the playground's caps and concurrency apply.
   */
  startOwn(choice: OwnChoice, app: string, now = Date.now()): { run_id: number } | { error: "app" | "case" | "busy" | "full" | "cap" } {
    if (!this.hasApp(app)) return { error: "app" };
    const cases = this.casesFor(app);
    const c = choice.caseId === "surprise" ? cases[randomInt(0, cases.length)] : cases.find((x) => x.id === choice.caseId);
    if (!c) return { error: "case" };
    const previous = this.ownBySession.get(choice.session);
    if (previous !== undefined && this.own.get(previous)?.state === "running") return { error: "busy" };
    if (this.stopped || this.inflight.size + this.replaying.size >= this.maxConcurrent) return { error: "full" };
    this.liveStarts = this.liveStarts.filter((t) => now - t < 3_600_000);
    if (!this.canSpend() || this.liveStarts.length >= this.runsPerHour) return { error: "cap" };
    this.liveStarts.push(now);
    this.lastAny = now;
    const runId = Number(this.db.prepare("INSERT INTO playground_runs (app, case_id, started_at, status) VALUES (?, ?, ?, 'running')").run(app, c.id, new Date().toISOString()).lastInsertRowid);
    const mine: Own = {
      runId, session: choice.session, app, c, heal: choice.heal, exam: choice.exam,
      runFrom: { kind: "bench", app, edits: c.inject ?? [], dir: this.dir },
      state: "running", patched: null, approvable: false, proved: false, busy: false, card: null, events: [],
      emit: () => undefined, until: now + OWN_TTL_MS,
    };
    if (previous !== undefined) this.own.delete(previous);
    this.own.set(runId, mine);
    this.ownBySession.set(choice.session, runId);
    const key = `own:${choice.session}`;
    const p = this.runLive(app, mine).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return { run_id: runId };
  }

  /** A ticket (60 s, single use) that opens the visitor's live feed. */
  feedTicket(session: string, now = Date.now()): string {
    for (const [t, v] of this.tickets) if (now > v.until) this.tickets.delete(t);
    if (this.tickets.size > 10_000) this.tickets.clear();
    const t = randomBytes(18).toString("base64url");
    this.tickets.set(t, { session, until: now + 60_000 });
    return t;
  }

  redeemTicket(ticket: string, now = Date.now()): string | null {
    const v = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return v && now <= v.until ? v.session : null;
  }

  /** The visitor's run, only for that visitor. */
  ownRun(session: string, runId: number, now = Date.now()): Own | null {
    const o = this.own.get(runId);
    if (!o || o.session !== session) return null;
    if (now > o.until) {
      this.own.delete(runId);
      return null;
    }
    return o;
  }

  /** What a returning visitor (or a reconnecting page) needs to pick up where they were. */
  ownSnapshot(session: string) {
    const id = this.ownBySession.get(session);
    const o = id === undefined ? null : this.ownRun(session, id);
    return o ? { run_id: o.runId, app: o.app, case_id: o.c.id, state: o.state, approvable: o.approvable, heal: o.heal, events: o.events, scorecard: o.card } : null;
  }

  /** Applies the fix to the visitor's copy, then our hidden test judges it. */
  async applyFix(o: Own, by: "approved" | "healed"): Promise<"applied" | "no"> {
    if (o.busy || o.state !== "broken" || !o.approvable || !o.patched) return "no";
    o.busy = true;
    try {
      o.emit("applied", { by });
      let hidden: Scorecard["hidden_test"] = "not_run";
      try {
        const ans = await runJob({ kind: "hidden", base: o.runFrom, patched: o.patched, test: o.c.test! });
        const r = ans.kind === "hidden" ? ans.outcome : "error";
        hidden = r === "passed" ? "passed" : r === "failed" ? "failed" : "not_run";
      } catch (e) {
        console.error("playground hidden test:", String(e));
      }
      o.state = "fixed";
      o.emit("hidden_test", { result: hidden, note: hidden === "not_run" ? "Our hidden test could not run this time." : null });
      if (o.card) {
        o.card = { ...o.card, hidden_test: hidden, applied_by: by };
        this.db.prepare("UPDATE playground_runs SET scorecard = ?, events = ? WHERE id = ?").run(JSON.stringify(o.card), JSON.stringify(o.events), o.runId);
        o.emit("done", { scorecard: o.card });
      }
      return "applied";
    } finally {
      o.busy = false;
    }
  }

  undo(o: Own): boolean {
    if (o.busy || o.state !== "fixed") return false;
    o.state = "broken";
    o.emit("undone", {});
    return true;
  }

  /** "Use the app": the real request on the visitor's copy, broken or with the fix applied. */
  async use(o: Own): Promise<"busy" | { fixed: boolean; answered: boolean; response: unknown; error: string | null; traceback: string | null }> {
    // One request in flight per run (it also holds approve and undo), and at most USE_AT_ONCE across all visitors.
    if (o.busy || this.usesInFlight >= USE_AT_ONCE) return "busy";
    o.busy = true;
    this.usesInFlight++;
    try {
      return await this.useNow(o);
    } finally {
      o.busy = false;
      this.usesInFlight--;
    }
  }

  private async useNow(o: Own): Promise<{ fixed: boolean; answered: boolean; response: unknown; error: string | null; traceback: string | null }> {
    const fixed = o.state === "fixed" && !!o.patched;
    const r = await runJob({ kind: "trigger", base: o.runFrom, code: o.c.trigger!, patched: fixed ? o.patched! : {}, respond: true });
    if (r.kind !== "trigger") throw new Error("unexpected runner answer");
    const ok = r.status === 0;
    let response: unknown = null;
    try {
      response = r.response ? JSON.parse(r.response) : null;
    } catch {
      response = null;
    }
    const strip = (t: string) => t.replaceAll(`${r.dir}${sep}`, "");
    const node = this.apps.find((a) => a.name === o.app)?.stack === "Node.js";
    const tb = ok ? null : strip(crashReport(node, r.stderr) || "").slice(-3000) || null;
    const last = tb ? tb.trim().split("\n").pop() ?? null : null;
    o.emit(ok ? "used_ok" : "used_crash", { fixed });
    return { fixed, answered: ok, response, error: ok ? null : (last ?? "The app crashed."), traceback: tb };
  }

  /** Forgets visitors' runs that have expired. */
  sweepOwn(now = Date.now()) {
    for (const [id, o] of this.own) if (now > o.until && o.state !== "running") {
      this.own.delete(id);
      if (this.ownBySession.get(o.session) === id) this.ownBySession.delete(o.session);
    }
  }

  private reachesOutside(dir: string, patched: Record<string, string>, d: DiagnosisResult): string | null {
    const originals: Record<string, string> = {};
    for (const p of Object.keys(patched)) {
      try {
        originals[p] = readFileSync(join(dir, p), "utf8");
      } catch {
        originals[p] = "";
      }
    }
    const js = riskyAdditions(d.edits, originals);
    if (js.length) return js[0];
    for (const [p, text] of Object.entries(patched)) {
      if (!p.endsWith(".py")) continue;
      const risky = riskyFixLines(originals[p], text);
      if (risky.length) return risky[0];
    }
    return null;
  }

  /**
   * At a spend cap: re-play a real past run of this app (or of any app) with its real timings, marked as a
   * replay. Returns false when there is nothing real to replay. Nothing is stored: replays are not results.
   */
  private replay(app: string): boolean {
    const row = (this.db.prepare("SELECT id, events FROM playground_runs WHERE status = 'done' AND app = ? ORDER BY id DESC LIMIT 1").get(app) ??
      this.db.prepare("SELECT id, events FROM playground_runs WHERE status = 'done' ORDER BY id DESC LIMIT 1").get()) as { id: number; events: string } | undefined;
    if (!row) return false;
    const past = JSON.parse(row.events) as PlaygroundEvent[];
    if (!past.length) return false;
    this.replaying.add(app);
    const events: PlaygroundEvent[] = [];
    this.current.set(app, events);
    const startedAt = Date.now();
    const send = (ev: PlaygroundEvent) => {
      const out: PlaygroundEvent = { ...ev, app, at: new Date().toISOString(), replay_of: { run_id: row.id, app: ev.app, at: ev.at } };
      events.push(out);
      playgroundBus.send(out);
    };
    send({ step: "replay", app, run_id: row.id, at: "", t: 0, data: { note: "Today's live budget for the playground is used up. Replaying the last real run, with its real results and timings." } });
    let i = 0;
    const next = () => {
      if (this.stopped || i >= past.length) {
        this.replaying.delete(app);
        this.current.delete(app);
        return;
      }
      const ev = past[i++];
      const wait = Math.max(0, Math.min(15_000, ev.t * 1000 - (Date.now() - startedAt)));
      setTimeout(() => {
        send(ev);
        next();
      }, wait).unref();
    };
    next();
    return true;
  }

  /** Reads a project setting (exposed for tests: playground apps never get an owner or alerts). */
  settingsOf(app: string) {
    return getSettings(this.db, this.projectFor(app));
  }
}
