// Creating apps for outside developers (website, Telegram /new, setup command) and their free credit.

import { randomBytes, randomInt } from "node:crypto";
import type { DB } from "./db/db.js";
import { envInt } from "./envint.js";

export const NEW_APPS_PER_DAY = envInt("JR_NEW_APPS_PER_DAY", 10, 4, 500);
/** Of today's new-app slots, this many are kept for the website and the setup command (Connect): Telegram /new cannot take them. */
export const CONNECT_RESERVE = 3;
export const APPS_PER_OWNER = 3;
export const FREE_CREDIT_USD = Number(process.env.JR_FREE_CREDIT_USD ?? 5);

let botUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (botUsername || !process.env.JR_TELEGRAM_BOT_TOKEN) return botUsername;
  const me = (await fetch(`https://api.telegram.org/bot${process.env.JR_TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json())
    .catch(() => null)) as { result?: { username?: string } } | null;
  botUsername = me?.result?.username ?? null;
  return botUsername;
}

export function cleanName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/[^\w .-]/g, "").slice(0, 40) : "";
}

export function outsideAppsToday(db: DB): number {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  return (db.prepare("SELECT COUNT(*) AS n FROM projects WHERE settings LIKE '%\"outside\":true%' AND created_at > ?").get(since) as { n: number }).n;
}

/** Public repository check: we read it without any permission. Returns false for private or missing repos. */
export async function isPublicRepo(repo: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { "user-agent": "jaagteraho-watcher", accept: "application/vnd.github+json", ...(process.env.JR_GITHUB_PUBLIC_READ_TOKEN ? { authorization: `Bearer ${process.env.JR_GITHUB_PUBLIC_READ_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const info = res?.ok ? ((await res.json()) as { private?: boolean }) : null;
  return !!info && info.private === false;
}

export function dsnFor(key: string, id: number): string {
  const base = new URL(process.env.JR_PUBLIC_INTAKE_URL ?? "http://127.0.0.1:8787");
  return `${base.protocol}//${key}@${base.host}/${id}`;
}

/** No-code option: the address a host's log drain sends logs to. */
export function logsUrlFor(key: string, id: number): string {
  const base = new URL(process.env.JR_PUBLIC_INTAKE_URL ?? "http://127.0.0.1:8787");
  return `${base.protocol}//${base.host}/logs/${id}/${key}`;
}

export type NewApp = { id: number; name: string; dsn: string; logs_url: string; link_code: string };

/** Creates an outside app (repo may be null: then diagnosis works from the stack trace alone). */
export function createOutsideApp(db: DB, name: string, repo: string | null, heal: "ask" | "auto-after" = "ask"): NewApp {
  const id = randomInt(100_000, 999_999);
  const key = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const uniqueName = `${name}-${randomBytes(2).toString("hex")}`;
  db.prepare(
    "INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (?, ?, ?, 'faurus', ?, 'read', ?, ?)",
  ).run(id, uniqueName, key, repo, JSON.stringify({ outside: true, critical: [], heal: { mode: heal, after_min: 10, max_per_night: 2, flows: [] } }), now);
  const code = randomBytes(6).toString("hex");
  db.prepare("INSERT INTO link_codes (code, project_id, expires_at) VALUES (?, ?, ?)").run(code, id, new Date(Date.now() + 7 * 86_400_000).toISOString());
  return { id, name: uniqueName, dsn: dsnFor(key, id), logs_url: logsUrlFor(key, id), link_code: code };
}

/**
 * Creates an outside app only if today's limit has room for this channel. The count and the insert are one
 * transaction, so requests racing each other (each waiting on GitHub first) cannot overrun the limit.
 */
export function createOutsideAppIfRoom(db: DB, via: "connect" | "telegram", name: string, repo: string | null, heal: "ask" | "auto-after" = "ask"): NewApp | null {
  const limit = via === "connect" ? NEW_APPS_PER_DAY : NEW_APPS_PER_DAY - CONNECT_RESERVE;
  return db.transaction(() => (outsideAppsToday(db) >= limit ? null : createOutsideApp(db, name, repo, heal))).immediate();
}

export function appsOwnedBy(db: DB, userId: number): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM owners o JOIN projects p ON p.id = o.project_id WHERE o.user_id = ? AND p.settings LIKE '%\"outside\":true%'").get(userId) as { n: number }
  ).n;
}

/** Free credit is per Telegram account: what its outside apps have spent on Claude, against $10. */
export function creditOf(db: DB, userId: number): { granted: number; used: number; left: number } {
  const used = (
    db
      .prepare(
        `SELECT COALESCE(SUM(s.cost_usd), 0) AS t FROM spend s JOIN owners o ON o.project_id = s.project_id
         JOIN projects p ON p.id = s.project_id WHERE o.user_id = ? AND p.settings LIKE '%"outside":true%'`,
      )
      .get(userId) as { t: number }
  ).t;
  return { granted: FREE_CREDIT_USD, used, left: Math.max(0, FREE_CREDIT_USD - used) };
}

/** Credit left for an app's owner; Infinity for our own apps (Faurus, the demo, JaagteRaho itself). */
export function creditLeftForProject(db: DB, projectId: number): number {
  const p = db.prepare("SELECT settings FROM projects WHERE id = ?").get(projectId) as { settings: string } | undefined;
  if (!p || !p.settings.includes('"outside":true')) return Infinity;
  const owner = db.prepare("SELECT user_id FROM owners WHERE project_id = ?").get(projectId) as { user_id: number } | undefined;
  return owner ? creditOf(db, owner.user_id).left : 0;
}
