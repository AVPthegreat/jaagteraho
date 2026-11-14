// Runs queued jobs: decide, alert, diagnose, gate. One job per incident event.

import { spendContext, type AI, type Lane } from "../ai/claude.js";
import { creditLeftForProject } from "../projects.js";
import { bus } from "../bus.js";
import { getSettings, kvGet, kvSet, type DB } from "../db/db.js";
import { esc } from "../telegram/api.js";
import type { CleanFrame } from "../intake/allowlist.js";
import { installationToken } from "../github/app.js";
import { GitHubSource, LocalSource, type GitHubToken, type SourceProvider } from "../source/source.js";
import type { Telegram } from "../telegram/api.js";
import { renderCard } from "../telegram/card.js";
import { isSelfProject, reportSelf } from "../selfwatch.js";
import type { Voice } from "../voice/voice.js";
import type { Phone } from "../phone/phone.js";
import { decide, saveDecision, severityWord, type Decision } from "./decide.js";
import { gatherFiles, runDiagnosis, type DiagnosisResult } from "./diagnose.js";
import { runGate } from "./gate.js";
import { proveFix } from "./verify.js";
import type { Healer } from "./heal.js";
import { lastChange, loadChange, saveChange, type Change } from "../source/changes.js";
import { envInt } from "../envint.js";

type Job = { id: number; kind: string; incident_id: number; payload: string; attempts: number };
type ProjectRow = { id: number; name: string; kind: "faurus" | "sandbox" | "paste"; repo: string | null; created_at: string; github_installation?: number | null };
type EventRow = { exception_type: string; message_masked: string; transaction_name: string | null; frames: string; tags: string; release: string | null };

const SANDBOX_ALERT_EVERY_MS = 15 * 60 * 1000;
const PING_EVERY_MS = 2 * 60 * 1000;
const MAX_PINGS = 3;
const CONCURRENCY = 4;
const DAILY_SONNET = 80; // about $0.75 a day at the measured $0.009 per diagnosis
/** Live diagnoses a day per lane, so the demo and outside apps can never use up Faurus's (ai/claude.ts has the $ caps). */
export const DAILY_DIAGNOSES: Record<Lane, number> = { faurus: DAILY_SONNET, demo: envInt("JR_DEMO_DIAGNOSES_PER_DAY", 80, 0, 2000), outside: 40, paste: 0 };
const VOICE_REUSE_MS = 15 * 60 * 1000;
const SANDBOX_LIVE_PER_FAULT = envInt("JR_DEMO_LIVE_PER_FAULT", 15, 0, 1000);
const MAX_WAKES_PER_NIGHT = 3;
const OUTSIDE_PER_DAY = 5;
const OUTSIDE_DECISIONS_PER_DAY = 200;
const OUTSIDE_DECISIONS_NO_CREDIT = 50;
const MAX_FIXES_PER_DAY = 3;
const RETENTION_DAYS = 30;

/** Each token reaches only its own repository; outside developers' public repositories use a token with no access at all. */
export function tokenFor(project: ProjectRow): GitHubToken {
  // An installed GitHub App (read-only, chosen by the owner) beats every shared token.
  if (project.github_installation) {
    const id = project.github_installation;
    const repo = project.repo;
    return () => installationToken(id, repo);
  }
  const token =
    project.kind === "sandbox"
      ? process.env.JR_GITHUB_SANDBOX_TOKEN
      : project.repo?.toLowerCase() === (process.env.JR_FAURUS_REPO ?? "AVPthegreat/faurus-app").toLowerCase()
        ? process.env.JR_GITHUB_FAURUS_READ_TOKEN
        : process.env.JR_GITHUB_PUBLIC_READ_TOKEN;
  return token || undefined;
}

export function sourceFor(project: ProjectRow): SourceProvider | null {
  if (!project.repo) return null;
  if (project.repo.startsWith("local:")) return new LocalSource(project.repo.slice(6));
  return new GitHubSource(project.repo, tokenFor(project), `project:${project.id}`);
}

/** The daily budget an app's model calls are charged to: the demo, an outside developer's app, or our own. */
export function laneFor(db: DB, projectId: number): Lane {
  const p = db.prepare("SELECT kind, settings FROM projects WHERE id = ?").get(projectId) as { kind: string; settings: string } | undefined;
  if (!p) return "faurus";
  if (p.kind === "sandbox") return "demo";
  return p.settings.includes('"outside":true') ? "outside" : "faurus";
}

/**
 * Real phone calls ring the founder's own number. The public demo is pressed by anonymous visitors,
 * so it never rings anyone unless JR_DEMO_PHONE=1 is set (only for the founder's own recorded demo).
 */
export function phoneAllowedFor(kind: string, env: NodeJS.ProcessEnv = process.env, settings: { playground?: boolean } = {}): boolean {
  // The playground (playground/runner.ts) never rings anyone, whatever JR_DEMO_PHONE says.
  if (settings.playground === true) return false;
  return kind !== "sandbox" || env.JR_DEMO_PHONE === "1";
}

/** Playground apps are run by playground/runner.ts, never by this worker: no cards, messages, calls or heals. */
export function isPlaygroundProject(db: DB, projectId: number): boolean {
  return getSettings(db, projectId).playground === true;
}

export class Worker {
  private running = 0;
  private timers: NodeJS.Timeout[] = [];
  /** Self-healing under the owner's rules (heal.ts); set by the server. */
  healer: Healer | null = null;

  constructor(
    private db: DB,
    private ai: AI | null,
    private tg: Telegram | null,
    private voice: Voice | null,
    private phone: Phone | null = null,
  ) {}

  start() {
    // Jobs left running by a crash go back on the queue.
    this.db.prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running'").run();
    this.timers.push(setInterval(() => this.pump(), 300));
    this.timers.push(setInterval(() => void this.pings().catch((e) => console.error("pings:", e)), 20_000));
    this.purgeOldEvents();
    this.timers.push(setInterval(() => this.purgeOldEvents(), 6 * 3_600_000));
  }

  stop() {
    this.timers.forEach(clearInterval);
  }

  private wakesSince(projectId: number, hours: number): number {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM decisions d JOIN incidents i ON i.id = d.incident_id WHERE i.project_id = ? AND d.action = 'wake' AND d.created_at > ?")
        .get(projectId, since) as { n: number }
    ).n;
  }

  private fixesShownToday(projectId: number): number {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id JOIN incidents i ON i.id = d.incident_id
           WHERE i.project_id = ? AND f.status != 'rejected' AND d.replayed_from IS NULL AND f.created_at > ?`,
        )
        .get(projectId, since) as { n: number }
    ).n;
  }

  /** Raw events are kept for 30 days; incidents, decisions and diagnoses stay. */
  purgeOldEvents(now = Date.now()): number {
    const cutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
    return this.db.prepare("DELETE FROM events WHERE received_at < ?").run(cutoff).changes;
  }

  private pump() {
    while (this.running < CONCURRENCY) {
      const now = new Date().toISOString();
      const job = this.db
        .prepare(
          `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
           WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1) RETURNING *`,
        )
        .get(now) as Job | undefined;
      if (!job) return;
      this.running++;
      this.process(job)
        .then(() => this.db.prepare("UPDATE jobs SET status = 'done', updated_at = ? WHERE id = ?").run(new Date().toISOString(), job.id))
        .catch((e) => {
          console.error(`job ${job.id} failed:`, e);
          // Failures while handling JaagteRaho's own incidents are not re-reported, so it cannot loop.
          const own = this.db.prepare("SELECT project_id FROM incidents WHERE id = ?").get(job.incident_id) as { project_id: number } | undefined;
          if (!own || !isSelfProject(own.project_id)) reportSelf(this.db, e, `worker: job ${job.kind}`);
          this.db.prepare("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?").run(job.attempts >= 2 ? "failed" : "queued", new Date().toISOString(), job.id);
        })
        .finally(() => this.running--);
    }
  }

  /** Every model call made for a job is charged to that job's app. */
  private process(job: Job): Promise<void> {
    const own = this.db.prepare("SELECT project_id FROM incidents WHERE id = ?").get(job.incident_id) as { project_id: number } | undefined;
    return spendContext.run({ projectId: own?.project_id ?? 0, lane: own ? laneFor(this.db, own.project_id) : "faurus" }, () => this.processJob(job));
  }

  private async processJob(job: Job) {
    if (job.kind !== "incident") return;
    const payload = JSON.parse(job.payload) as { change: "new" | "repeat" | "reopened"; event_id: string; session: string | null };
    const inc = this.db.prepare("SELECT id, project_id, status, hits FROM incidents WHERE id = ?").get(job.incident_id) as
      | { id: number; project_id: number; status: string; hits: number }
      | undefined;
    if (!inc) return;
    const project = this.db.prepare("SELECT id, name, kind, repo, created_at, github_installation FROM projects WHERE id = ?").get(inc.project_id) as ProjectRow;
    if (isPlaygroundProject(this.db, project.id)) return;
    const ev = this.db
      .prepare("SELECT exception_type, message_masked, transaction_name, frames, tags, release FROM events WHERE project_id = ? AND event_id = ?")
      .get(project.id, payload.event_id) as EventRow | undefined;
    if (!ev) return;
    const event = {
      exception_type: ev.exception_type,
      message: ev.message_masked,
      transaction: ev.transaction_name,
      frames: JSON.parse(ev.frames) as CleanFrame[],
      tags: JSON.parse(ev.tags) as Record<string, string>,
    };
    const session = project.kind === "sandbox" ? payload.session : null;
    const feed = (type: Parameters<typeof bus.publish>[1]["type"], data: Record<string, unknown>) =>
      bus.publish(session, { type, at: new Date().toISOString(), incident_id: inc.id, data });

    feed("error", { exception_type: event.exception_type, message: event.message, route: event.transaction });

    const owner = this.db.prepare("SELECT chat_id, paused FROM owners WHERE project_id = ?").get(project.id) as { chat_id: number; paused: number } | undefined;
    const alert = this.db.prepare("SELECT message_id, chat_id FROM alerts WHERE incident_id = ?").get(inc.id) as { message_id: number; chat_id: number } | undefined;

    // A test error from `npx jaagteraho test` proves the setup works. It never reaches a model.
    if (event.tags.jr_test) {
      this.db.prepare("UPDATE incidents SET status = 'closed' WHERE id = ?").run(inc.id);
      if (owner && this.tg) {
        await this.tg.send(
          owner.chat_id,
          `✅ <b>${esc(project.name)} is connected.</b>\nThis was a test error sent by the setup command. When a real error arrives, JaagteRaho decides whether to wake you, explains the cause and proposes a fix.`,
        );
        kvSet(this.db, `connected:${project.id}`, new Date().toISOString());
      }
      return;
    }
    // The first real error from an app tells the owner the connection works.
    if (owner && this.tg && !kvGet(this.db, `connected:${project.id}`) && project.kind !== "sandbox" && !isSelfProject(project.id)) {
      kvSet(this.db, `connected:${project.id}`, new Date().toISOString());
      await this.tg
        .send(owner.chat_id, `✅ <b>${esc(project.name)} is connected.</b> The first error just arrived (${esc(event.exception_type)} on ${esc(event.transaction ?? "?")}). Deciding now.`)
        .catch((e) => console.error("connected notice:", e));
    }

    // Repeats only refresh the card, except sandbox visitors, who each get their own run.
    if (payload.change === "repeat" && !session) {
      await this.refreshCard(inc.id, true);
      return;
    }

    const decision = await decide(
      this.db,
      this.decisionAI(project, !!owner),
      { incidentId: inc.id, projectId: project.id, projectName: project.name, change: payload.change === "repeat" ? "new" : payload.change, status: inc.status, hits: inc.hits, event },
      owner?.paused === 1,
    );
    if (owner?.paused === 1 && decision.action === "wake") {
      decision.action = "notify";
      decision.rule_text += " (wake held: paused)";
    }
    // At most 3 wakes per app in 12 hours. The sandbox is exempt: every visitor sees their own run,
    // and its owner alerts are already limited to one card per fault every 15 minutes.
    if (decision.action === "wake" && project.kind !== "sandbox" && this.wakesSince(project.id, 12) >= MAX_WAKES_PER_NIGHT) {
      decision.action = "notify";
      decision.rule_text += ` (wake held: ${MAX_WAKES_PER_NIGHT} wakes already in 12 hours)`;
    }
    saveDecision(this.db, inc.id, decision);
    // Anything first seen in learn mode is old backlog: it never wakes anyone later.
    if (decision.facts.learn_mode) this.db.prepare("UPDATE incidents SET status = 'backlog' WHERE id = ?").run(inc.id);
    feed("decision", {
      action: decision.action, rule: decision.rule, rule_text: decision.rule_text, engine: decision.engine,
      votes: decision.votes, facts: decision.facts,
      severity_word: decision.votes.severity ? severityWord(decision.votes.severity.value) : null,
    });

    const important = decision.action === "notify" || decision.action === "wake";
    if (!important) return;

    // Alert the owner. Sandbox incidents send a fresh card at most every 15 minutes.
    let cardSent = false;
    if (owner && this.tg) {
      const recent = alert && project.kind === "sandbox" && this.alertAgeMs(inc.id) < SANDBOX_ALERT_EVERY_MS;
      if (alert && (recent || payload.change === "repeat")) {
        await this.refreshCard(inc.id, false);
      } else {
        cardSent = await this.sendCard(inc.id, owner.chat_id, decision);
      }
    }
    // A real phone call on a WAKE, only when a fresh alert card went out (so Acknowledge and the repeats
    // have a card to work with). It never blocks the alert or the diagnosis, and a failure is only logged.
    const phoneDone =
      decision.action === "wake" && cardSent && this.phone && phoneAllowedFor(project.kind, process.env, getSettings(this.db, project.id))
        ? this.phone
            .wake(inc.id, project.id, { project: project.name, flow: decision.facts.critical ?? event.transaction ?? "the app", hits: inc.hits, exam: decision.facts.exam_open })
            .catch((e) => console.error("phone:", String(e)))
        : Promise.resolve();
    // The wake-up call runs alongside the diagnosis so it never delays the cause.
    const voiceDone =
      decision.action === "wake" && this.voice
        ? this.voice
            // One clip per incident per 15 minutes, reused by every run in between (voice.ts).
            .wakeCall({ project: project.name, flow: decision.facts.critical ?? event.transaction ?? "the app", hits: inc.hits, exam: decision.facts.exam_open }, { key: `incident:${inc.id}`, reuseMs: VOICE_REUSE_MS })
            .then(async (clip) => {
              if (!clip) return;
              feed("voice", { url: `/public/voice/${clip.id}` });
              if (cardSent && owner && this.tg) await this.tg.sendVoice(owner.chat_id, clip.ogg, "Wake-up call");
            })
            .catch((e) => {
              console.error("voice:", e);
              if (!isSelfProject(project.id)) reportSelf(this.db, e, "worker: wake-up call");
            })
        : Promise.resolve();

    if (owner?.paused !== 1) {
      await this.diagnoseAndGate(project, inc.id, event, ev.release, feed);
      await this.healer?.onFix(inc.id, { session, action: decision.action }).catch((e) => console.error("heal:", e));
      await this.refreshCard(inc.id, false);
    }
    await voiceDone;
    await phoneDone;
  }

  private alertAgeMs(incidentId: number): number {
    const row = this.db.prepare("SELECT last_ping_at FROM alerts WHERE incident_id = ?").get(incidentId) as { last_ping_at: string | null } | undefined;
    return row?.last_ping_at ? Date.now() - Date.parse(row.last_ping_at) : Infinity;
  }

  private async sendCard(incidentId: number, chatId: number, decision: Decision): Promise<boolean> {
    const card = renderCard(this.db, incidentId);
    if (!card || !this.tg) return false;
    const msg = await this.tg.send(chatId, card.text, card.markup);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO alerts (incident_id, chat_id, message_id, action, acked, pings, last_ping_at, last_edit_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)
         ON CONFLICT(incident_id) DO UPDATE SET chat_id = excluded.chat_id, message_id = excluded.message_id, action = excluded.action,
           acked = 0, pings = 0, last_ping_at = excluded.last_ping_at, last_edit_at = excluded.last_edit_at`,
      )
      .run(incidentId, chatId, msg.message_id, decision.action, now, now);
    return true;
  }

  async refreshCard(incidentId: number, throttle: boolean) {
    if (!this.tg) return;
    const alert = this.db.prepare("SELECT chat_id, message_id, last_edit_at FROM alerts WHERE incident_id = ?").get(incidentId) as
      | { chat_id: number; message_id: number; last_edit_at: string | null }
      | undefined;
    if (!alert) return;
    if (throttle && alert.last_edit_at && Date.now() - Date.parse(alert.last_edit_at) < 30_000) return;
    const card = renderCard(this.db, incidentId);
    if (!card) return;
    await this.tg.edit(alert.chat_id, alert.message_id, card.text, card.markup).catch((e) => console.error("edit card:", e));
    this.db.prepare("UPDATE alerts SET last_edit_at = ? WHERE incident_id = ?").run(new Date().toISOString(), incidentId);
  }

  private projectDiagnosesToday(projectId: number) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM diagnoses d JOIN incidents i ON i.id = d.incident_id WHERE i.project_id = ? AND d.replayed_from IS NULL AND d.created_at > ?")
        .get(projectId, since) as { n: number }
    ).n;
  }

  private liveDiagnosesToday(incidentId: number) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return (this.db.prepare("SELECT COUNT(*) AS n FROM diagnoses WHERE incident_id = ? AND replayed_from IS NULL AND created_at > ?").get(incidentId, since) as { n: number }).n;
  }

  private async diagnoseAndGate(
    project: ProjectRow,
    incidentId: number,
    event: { exception_type: string; message: string; transaction: string | null; frames: CleanFrame[] },
    release: string | null,
    feed: (type: "cause" | "fix" | "change", data: Record<string, unknown>) => void,
  ) {
    const firstDay = Date.now() - Date.parse(project.created_at) < 24 * 3600 * 1000;
    const perIncident = project.kind === "sandbox" ? SANDBOX_LIVE_PER_FAULT : firstDay ? 5 : DAILY_SONNET;
    // Apps connected by outside developers get at most 5 live diagnoses a day across all their incidents.
    const outside = getSettings(this.db, project.id).outside === true;
    const creditLeft = creditLeftForProject(this.db, project.id);
    if (creditLeft < 0.02) {
      feed("cause", { unavailable: "Your free AI credit is used up, so this error was decided and alerted but not diagnosed." });
      await this.creditNotice(project);
      return;
    }
    const canLive =
      !!this.ai &&
      this.liveDiagnosesToday(incidentId) < perIncident &&
      (!outside || this.projectDiagnosesToday(project.id) < OUTSIDE_PER_DAY) &&
      this.ai.guard.countToday("diagnosis", laneFor(this.db, project.id)) < DAILY_DIAGNOSES[laneFor(this.db, project.id)] &&
      this.ai.guard.pick(this.ai.diagnosisModel, this.ai.decisionModel) !== null;

    if (!canLive) {
      const replayed = this.replay(incidentId);
      if (replayed) {
        feed("cause", { ...replayed.result, replayed: true, diagnosis_id: replayed.diagnosisId });
        if (replayed.fix) feed("fix", replayed.fix);
      } else {
        feed("cause", { unavailable: "Diagnosis limit for today reached." });
      }
      return;
    }

    const src = sourceFor(project);
    const [{ files, sourceMoved }, change, index] = await Promise.all([
      src ? gatherFiles(this.db, src, project.id, event.frames, release) : Promise.resolve({ files: [], sourceMoved: false }),
      this.changeFor(project, incidentId, event.frames, release),
      // The repository's code, so the diagnosis can look up what the stack trace does not show.
      src?.index && process.env.JR_DIAGNOSIS_LOOKUPS !== "0" ? src.index(release).catch(() => null) : Promise.resolve(null),
    ]);
    if (change) feed("change", { ...change });
    const started = Date.now();
    // Lookup rounds stop as soon as the owner's credit falls under the floor checked above.
    const out = await runDiagnosis(this.ai!, event, files, sourceMoved, change, files.length ? index : null, {
      budgetOk: () => creditLeftForProject(this.db, project.id) >= 0.02,
    });
    if ("error" in out) {
      feed("cause", { unavailable: `Diagnosis failed: ${out.error}` });
      return;
    }
    const now = new Date().toISOString();
    const diagnosisId = Number(
      this.db
        .prepare(
          "INSERT INTO diagnoses (incident_id, model, input_tokens, output_tokens, cost_usd, result, source_moved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(incidentId, out.model, out.input_tokens, out.output_tokens, out.cost, JSON.stringify(out.result), sourceMoved ? 1 : 0, now).lastInsertRowid,
    );
    feed("cause", { ...out.result, diagnosis_id: diagnosisId, seconds: Math.round((Date.now() - started) / 1000), model: out.model });
    await this.refreshCard(incidentId, false);

    files.push(...out.files_read);
    const gate = await runGate(this.ai, out.result, files);
    // At most 3 fix proposals per real app per day, so a bad night cannot flood the owner with diffs.
    if (gate.passed && project.kind !== "sandbox" && this.fixesShownToday(project.id) >= MAX_FIXES_PER_DAY) {
      gate.passed = false;
      gate.level = "withheld";
      gate.reasons = [`${MAX_FIXES_PER_DAY} fixes already proposed today; the cause above is still right`];
    }
    // On the demo portal, a passed fix is proved by running the model's regression test on old and fixed code.
    const proofRoot = project.kind !== "sandbox" ? null : project.repo?.startsWith("local:") ? project.repo.slice(6) : process.env.JR_SANDBOX_SOURCE ?? null;
    const testRun = gate.passed && proofRoot ? await proveFix(proofRoot, gate.patched, out.result.regression_test) : null;
    // A test that ran but did not prove the fix is a concern the owner should see before approving.
    if (testRun?.verdict === "not_proved" && gate.level === "recommended") {
      gate.level = "caution";
      gate.reasons = [...gate.reasons, "its own regression test did not prove it"];
    }
    const status = gate.passed ? "shown" : "rejected";
    const fixId = Number(
      this.db
        .prepare("INSERT INTO fixes (diagnosis_id, diff, gate_result, status, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(diagnosisId, gate.diff, JSON.stringify({ passed: gate.passed, level: gate.level, reasons: gate.reasons, changed_lines: gate.changed_lines, review: gate.review, test_run: testRun, risky: gate.risky }), status, new Date().toISOString())
        .lastInsertRowid,
    );
    feed("fix", { fix_id: fixId, status, level: gate.level, diff: gate.passed ? gate.diff : null, reasons: gate.reasons, changed_lines: gate.changed_lines, test_run: testRun, test_code: gate.passed ? out.result.regression_test?.code || null : null });
  }

  /**
   * Model calls for deciding are cheap but not free. Outside apps get none until an owner is linked,
   * at most 200 a day, and 50 a day once the owner's credit is used up; past that, rules decide alone.
   */
  private decisionAI(project: ProjectRow, hasOwner: boolean): AI | null {
    if (!this.ai || getSettings(this.db, project.id).outside !== true) return this.ai;
    if (!hasOwner) return null;
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const today = (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM decisions d JOIN incidents i ON i.id = d.incident_id WHERE i.project_id = ? AND d.engine = 'claude' AND d.created_at > ?")
        .get(project.id, since) as { n: number }
    ).n;
    const cap = creditLeftForProject(this.db, project.id) < 0.02 ? OUTSIDE_DECISIONS_NO_CREDIT : OUTSIDE_DECISIONS_PER_DAY;
    return today < cap ? this.ai : null;
  }

  /** The last commit before this incident began, looked up once per incident (GitHub repositories only). */
  private async changeFor(project: ProjectRow, incidentId: number, frames: CleanFrame[], release: string | null): Promise<Change | null> {
    if (!project.repo || project.repo.startsWith("local:")) return null;
    const cached = loadChange(this.db, incidentId);
    if (cached !== undefined) return cached;
    const inc = this.db.prepare("SELECT first_seen FROM incidents WHERE id = ?").get(incidentId) as { first_seen: string };
    const c = await lastChange(project.repo, tokenFor(project), inc.first_seen, release, frames).catch(() => null);
    saveChange(this.db, incidentId, c);
    return c;
  }

  /** Tells an outside owner once that their free credit ran out. */
  private async creditNotice(project: ProjectRow) {
    const owner = this.db.prepare("SELECT chat_id, user_id FROM owners WHERE project_id = ?").get(project.id) as { chat_id: number; user_id: number } | undefined;
    if (!owner || !this.tg || kvGet(this.db, `credit_out:${owner.user_id}`)) return;
    kvSet(this.db, `credit_out:${owner.user_id}`, new Date().toISOString());
    await this.tg
      .send(owner.chat_id, "Your free AI credit is used up. I'll keep deciding and alerting (that costs a fraction of a cent, which we cover), but I can't explain causes or propose fixes until it's topped up. /credits shows the details.")
      .catch((e) => console.error("credit notice:", e));
  }

  /** Copies the latest live diagnosis (and its fix) for a repeat visitor. */
  private replay(incidentId: number) {
    const d = this.db
      .prepare("SELECT id, model, result, source_moved, created_at FROM diagnoses WHERE incident_id = ? AND replayed_from IS NULL ORDER BY id DESC LIMIT 1")
      .get(incidentId) as { id: number; model: string; result: string; source_moved: number; created_at: string } | undefined;
    if (!d) return null;
    const now = new Date().toISOString();
    const diagnosisId = Number(
      this.db
        .prepare("INSERT INTO diagnoses (incident_id, model, result, source_moved, replayed_from, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(incidentId, d.model, d.result, d.source_moved, d.id, now).lastInsertRowid,
    );
    const f = this.db.prepare("SELECT diff, gate_result, status, pr_url, commit_sha FROM fixes WHERE diagnosis_id = ? ORDER BY id DESC LIMIT 1").get(d.id) as
      | { diff: string; gate_result: string; status: string; pr_url: string | null; commit_sha: string | null }
      | undefined;
    let fix: Record<string, unknown> | null = null;
    if (f) {
      // The copy keeps the original status: a fix the owner already approved is not approvable twice.
      const status = f.status;
      const fixId = Number(
        this.db
          .prepare("INSERT INTO fixes (diagnosis_id, diff, gate_result, status, pr_url, commit_sha, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(diagnosisId, f.diff, f.gate_result, status, f.pr_url, f.commit_sha, now).lastInsertRowid,
      );
      const g = JSON.parse(f.gate_result) as { level?: string; reasons: string[]; changed_lines: number; test_run?: unknown };
      const testCode = (JSON.parse(d.result) as DiagnosisResult).regression_test?.code || null;
      fix = {
        fix_id: fixId, status: status === "rejected" ? "rejected" : "shown", level: g.level, diff: status !== "rejected" ? f.diff : null, reasons: g.reasons, changed_lines: g.changed_lines,
        test_run: g.test_run ?? null, test_code: status !== "rejected" ? testCode : null, replayed: true,
      };
    }
    return { diagnosisId, result: { ...(JSON.parse(d.result) as DiagnosisResult), recorded_at: d.created_at }, fix };
  }

  /** Wake alerts repeat every 2 minutes, up to 3 times, until acknowledged. */
  private async pings() {
    if (!this.tg) return;
    const due = this.db
      .prepare("SELECT incident_id, chat_id, message_id, pings, last_ping_at FROM alerts WHERE action = 'wake' AND acked = 0 AND pings < ?")
      .all(MAX_PINGS) as Array<{ incident_id: number; chat_id: number; message_id: number; pings: number; last_ping_at: string | null }>;
    for (const a of due) {
      if (a.last_ping_at && Date.now() - Date.parse(a.last_ping_at) < PING_EVERY_MS) continue;
      await this.tg
        .call("sendMessage", {
          chat_id: a.chat_id,
          text: `Still waiting for you: ping ${a.pings + 1} of ${MAX_PINGS}. Tap Acknowledge on the alert to stop.`,
          reply_parameters: { message_id: a.message_id },
        })
        .catch((e) => console.error("ping:", e));
      this.db.prepare("UPDATE alerts SET pings = pings + 1, last_ping_at = ? WHERE incident_id = ?").run(new Date().toISOString(), a.incident_id);
      // The phone rings again with each ping, until acknowledged (by keypress or in Telegram).
      if (this.phone) await this.phone.repeat(a.incident_id, a.pings + 1).catch((e) => console.error("phone repeat:", String(e)));
    }
  }

  /** Called after the owner pressed 1 on the phone call: the alert is already marked acknowledged. */
  async acknowledgedByPhone(incidentId: number) {
    await this.refreshCard(incidentId, false);
    const a = this.db.prepare("SELECT chat_id, message_id FROM alerts WHERE incident_id = ?").get(incidentId) as { chat_id: number; message_id: number } | undefined;
    if (a && this.tg) {
      await this.tg
        .call("sendMessage", { chat_id: a.chat_id, text: "Acknowledged on the phone call. Repeats stopped.", reply_parameters: { message_id: a.message_id } })
        .catch((e) => console.error("phone ack notice:", e));
    }
  }
}
