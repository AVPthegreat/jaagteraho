// The JaagteRaho GitHub App: one-click, read-only access to an owner's repository (private ones too).
// Permissions requested when the app is created on GitHub: Contents read, Metadata read. Nothing else.
//
// Install flow, started from Telegram with /github:
//   1. The owner opens a link to install the app, carrying a signed `state` (app id + Telegram user).
//   2. GitHub sends them back to /github/setup with installation_id, state and an OAuth `code`
//      ("Request user authorization during installation" is switched on in the app settings).
//   3. We swap the code for a user token and check that THIS GitHub user can see THIS installation.
//      Without that check, anyone could attach someone else's installation id to their own app.
//   4. The installation is saved on the app; tokens are minted per use, read-only, for one hour.

import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import type { DB } from "../db/db.js";
import type { Telegram } from "../telegram/api.js";
import { esc } from "../telegram/api.js";

const STATE_TTL_MS = 30 * 60 * 1000;

export function appConfigured(): boolean {
  return !!(process.env.JR_GITHUB_APP_ID && privateKey() && process.env.JR_GITHUB_APP_SLUG && process.env.JR_GITHUB_APP_CLIENT_ID && process.env.JR_GITHUB_APP_CLIENT_SECRET);
}

function privateKey(): string | null {
  if (process.env.JR_GITHUB_APP_PRIVATE_KEY) return process.env.JR_GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
  if (process.env.JR_GITHUB_APP_PRIVATE_KEY_FILE) {
    try {
      return readFileSync(process.env.JR_GITHUB_APP_PRIVATE_KEY_FILE, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

/** A 9-minute JWT that identifies the app itself to GitHub (RS256). */
export function appJwt(now = Date.now()): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(now / 1000) - 60;
  const body = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat, exp: iat + 540, iss: process.env.JR_GITHUB_APP_ID })}`;
  const sig = createSign("RSA-SHA256").update(body).sign(privateKey()!, "base64url");
  return `${body}.${sig}`;
}

const cache = new Map<string, { token: string; until: number }>();

/**
 * A read-only installation token, limited to one repository when it is known, cached until
 * 10 minutes before it expires.
 */
export async function installationToken(installationId: number, repo?: string | null): Promise<string | undefined> {
  const name = repo?.split("/")[1];
  const key = `${installationId}:${name ?? "*"}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.token;
  if (!appConfigured()) return undefined;
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { authorization: `Bearer ${appJwt()}`, accept: "application/vnd.github+json", "user-agent": "jaagteraho-watcher", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ permissions: { contents: "read", metadata: "read" }, ...(name ? { repositories: [name] } : {}) }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return undefined;
  const j = (await res.json()) as { token: string; expires_at: string };
  cache.set(key, { token: j.token, until: Date.parse(j.expires_at) - 10 * 60_000 });
  return j.token;
}

function signState(projectId: number, userId: number, exp: number): string {
  return createHmac("sha256", process.env.JR_LINK_SECRET ?? "").update(`gh:${projectId}:${userId}:${exp}`).digest("base64url");
}

export function installUrl(projectId: number, userId: number, now = Date.now()): string | null {
  if (!appConfigured() || !process.env.JR_LINK_SECRET) return null;
  const exp = now + STATE_TTL_MS;
  const state = `${projectId}.${userId}.${exp}.${signState(projectId, userId, exp)}`;
  return `https://github.com/apps/${process.env.JR_GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
}

export function readState(state: string, now = Date.now()): { projectId: number; userId: number } | null {
  const [p, u, e, sig] = state.split(".");
  const projectId = Number(p);
  const userId = Number(u);
  const exp = Number(e);
  if (!process.env.JR_LINK_SECRET || !sig || !Number.isFinite(exp) || exp < now || exp > now + STATE_TTL_MS + 60_000) return null;
  const want = Buffer.from(signState(projectId, userId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? { projectId, userId } : null;
}

type GhFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Confirms the GitHub user who just installed can see this installation, and lists its repositories. */
export async function confirmInstallation(code: string, installationId: number, f: GhFetch = fetch): Promise<{ repos: string[] } | { error: string }> {
  const tok = await f("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.JR_GITHUB_APP_CLIENT_ID, client_secret: process.env.JR_GITHUB_APP_CLIENT_SECRET, code }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const userToken = tok?.ok ? ((await tok.json()) as { access_token?: string }).access_token : undefined;
  if (!userToken) return { error: "GitHub did not confirm who you are. Try /github again." };
  const h = { authorization: `Bearer ${userToken}`, accept: "application/vnd.github+json", "user-agent": "jaagteraho-watcher", "x-github-api-version": "2022-11-28" };
  const mine = await f("https://api.github.com/user/installations?per_page=100", { headers: h, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const list = mine?.ok ? ((await mine.json()) as { installations?: Array<{ id: number }> }).installations ?? [] : [];
  if (!list.some((i) => i.id === installationId)) return { error: "That installation does not belong to your GitHub account." };
  const reposRes = await f(`https://api.github.com/user/installations/${installationId}/repositories?per_page=100`, { headers: h, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const repos = reposRes?.ok ? ((await reposRes.json()) as { repositories?: Array<{ full_name: string }> }).repositories?.map((r) => r.full_name) ?? [] : [];
  return { repos };
}

/** Saves the installation; picks the repository when it is clear which one is meant. */
export function attachInstallation(db: DB, projectId: number, installationId: number, repos: string[]): { repo: string | null; choices: string[] } {
  const p = db.prepare("SELECT repo FROM projects WHERE id = ?").get(projectId) as { repo: string | null } | undefined;
  if (!p) return { repo: null, choices: [] };
  const current = p.repo && !p.repo.startsWith("local:") ? p.repo : null;
  const match = current ? repos.find((r) => r.toLowerCase() === current.toLowerCase()) : null;
  const repo = match ?? (repos.length === 1 ? repos[0] : null);
  db.prepare("UPDATE projects SET github_installation = ?, repo = COALESCE(?, repo) WHERE id = ?").run(installationId, repo, projectId);
  // Remembered for 30 minutes so /repo can pick one; after that the owner installs again, so access is re-checked.
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`gh_repos:${projectId}`, JSON.stringify({ at: Date.now(), repos }));
  return { repo, choices: repo ? [] : repos.slice(0, 20) };
}

export function githubRoutes(db: DB, tg: Telegram | null) {
  const app = new Hono();
  app.get("/github/setup", async (c) => {
    const page = (title: string, text: string, status: 200 | 400 = 200) =>
      c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>JaagteRaho</title><body style="font-family:system-ui;background:#0e1626;color:#e8edf6;max-width:520px;margin:15vh auto;padding:0 16px"><h1 style="font-size:22px">${title}</h1><p>${text}</p><p>You can close this tab and go back to Telegram.</p></body>`, status);
    const state = readState(c.req.query("state") ?? "");
    const installationId = Number(c.req.query("installation_id"));
    const code = c.req.query("code");
    if (!state || !Number.isInteger(installationId) || !code) return page("That link has expired", "Send /github to the bot again for a fresh link.", 400);
    const owner = db.prepare("SELECT chat_id FROM owners WHERE project_id = ? AND user_id = ?").get(state.projectId, state.userId) as { chat_id: number } | undefined;
    if (!owner) return page("Not linked", "This app is not linked to your Telegram account.", 400);
    const ok = await confirmInstallation(code, installationId);
    if ("error" in ok) return page("Not connected", esc(ok.error), 400);
    const { repo, choices } = attachInstallation(db, state.projectId, installationId, ok.repos);
    const msg = repo
      ? `✅ GitHub connected (read-only). I'll read <b>${esc(repo)}</b> to explain causes.`
      : `✅ GitHub connected (read-only). Which repository is this app? Send one of:\n${choices.map((r) => `/repo ${esc(r)}`).join("\n")}`;
    if (tg) await tg.send(owner.chat_id, msg).catch(() => undefined);
    return page("GitHub connected", repo ? `JaagteRaho can now read ${esc(repo)}, read-only.` : "Pick the repository in Telegram.");
  });
  return app;
}
