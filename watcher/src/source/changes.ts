// "Started after your last deploy": finds the commit that went live just before an error first
// appeared, and whether it touched a file in the stack trace. Read-only GitHub calls.

import type { DB } from "../db/db.js";
import type { CleanFrame } from "../intake/allowlist.js";

export type Change = {
  sha: string;
  message: string;
  author: string;
  committed_at: string;
  files: string[];
  suspect: string[]; // changed files that appear in the stack trace
  minutes_before: number; // how long before the first error the commit was made
  via: "release" | "time";
};

type Token = string | undefined | (() => Promise<string | undefined>);

async function gh(path: string, token: Token): Promise<unknown | null> {
  const t = typeof token === "function" ? await token() : token;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "jaagteraho-watcher",
      "x-github-api-version": "2022-11-28",
      ...(t ? { authorization: `Bearer ${t}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return res?.ok ? res.json() : null;
}

/** Changed files that also appear in the stack trace (matched by path suffix). */
export function suspects(files: string[], frames: CleanFrame[]): string[] {
  const paths = frames.filter((f) => f.in_app).map((f) => (f.abs_path ?? f.filename ?? "").replace(/\\/g, "/"));
  return files.filter((file) => paths.some((p) => p === file || p.endsWith(`/${file}`)));
}

/**
 * The release, if it is a commit hash, is the most precise answer. Otherwise: the newest commit on the
 * default branch made before the error first appeared, if it was made within the last 3 days.
 */
export async function lastChange(repo: string, token: Token, firstSeenIso: string, release: string | null, frames: CleanFrame[]): Promise<Change | null> {
  type Commit = { sha: string; commit: { message: string; author: { name: string; date: string }; committer: { date: string } }; files?: Array<{ filename: string }> };
  let commit: Commit | null = null;
  let via: Change["via"] = "time";
  const sha = release?.match(/\b[0-9a-f]{7,40}\b/i)?.[0];
  if (sha) {
    commit = (await gh(`/repos/${repo}/commits/${sha}`, token)) as Commit | null;
    if (commit) via = "release";
  }
  if (!commit) {
    const list = (await gh(`/repos/${repo}/commits?until=${encodeURIComponent(firstSeenIso)}&per_page=1`, token)) as Commit[] | null;
    if (!list?.[0]) return null;
    commit = (await gh(`/repos/${repo}/commits/${list[0].sha}`, token)) as Commit | null;
    if (!commit) return null;
  }
  const committed = commit.commit.committer?.date ?? commit.commit.author.date;
  const minutes = Math.round((Date.parse(firstSeenIso) - Date.parse(committed)) / 60_000);
  if (via === "time" && (minutes < 0 || minutes > 3 * 24 * 60)) return null;
  const files = (commit.files ?? []).map((f) => f.filename).slice(0, 50);
  return {
    sha: commit.sha,
    message: commit.commit.message.split("\n")[0].slice(0, 120),
    author: commit.commit.author.name.slice(0, 60),
    committed_at: committed,
    files,
    suspect: suspects(files, frames),
    minutes_before: minutes,
    via,
  };
}

export function saveChange(db: DB, incidentId: number, c: Change | null) {
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`change:${incidentId}`, JSON.stringify(c));
}

export function loadChange(db: DB, incidentId: number): Change | null | undefined {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(`change:${incidentId}`) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as Change | null) : undefined;
}

/** One line for the owner: "Began 20 min after commit abc1234 "Fix quiz" by Riya, which changed quiz/views.py (in the stack)." */
export function describeChange(c: Change): string {
  const when = c.via === "release" ? "Running commit" : c.minutes_before < 120 ? `Began ${Math.max(1, c.minutes_before)} min after commit` : `Began ${Math.round(c.minutes_before / 60)} h after commit`;
  const touched = c.suspect.length ? `, which changed ${c.suspect.slice(0, 2).join(", ")} (in the stack trace)` : c.files.length ? `; it changed ${c.files.length} file${c.files.length === 1 ? "" : "s"}, none in the stack trace` : "";
  return `${when} ${c.sha.slice(0, 7)} "${c.message}" by ${c.author}${touched}.`;
}
