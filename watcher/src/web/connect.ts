// Self-serve: an outside developer connects their own app. They get a SENTRY_DSN line and a
// one-tap Telegram link. If they give a repository it must be public; JaagteRaho reads it and never writes.
// The setup command (npx jaagteraho init) uses this same endpoint.

import { Hono } from "hono";
import type { DB } from "../db/db.js";
import { createOutsideApp, cleanName, getBotUsername, isPublicRepo, NEW_APPS_PER_DAY, outsideAppsToday } from "../projects.js";
import { parseRepo } from "./paste.js";
import { clientIp, Window } from "./public.js";

const limits = new Window();

export function connectRoutes(db: DB) {
  const app = new Hono();

  app.post("/public/connect", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: unknown; name?: unknown; repo?: unknown; consent?: unknown };
    const session = typeof body.session === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.session) ? body.session : null;
    if (!session) return c.json({ error: "Reload the page and try again." }, 400);
    if (body.consent !== true) return c.json({ error: "Please read and accept the data note first." }, 400);
    const name = cleanName(body.name);
    if (name.length < 2) return c.json({ error: "Give your app a name (letters and numbers)." }, 400);
    const noRepo = body.repo === undefined || body.repo === null || body.repo === "";
    const repo = typeof body.repo === "string" ? parseRepo(body.repo) : null;
    if (!noRepo && !repo) return c.json({ error: "Give your app's public GitHub repository, like https://github.com/you/app, or leave it empty." }, 400);

    if (!limits.allow(`s:${session}`, 1, 86_400_000) || !limits.allow(`ip:${clientIp(c)}`, 2, 86_400_000))
      return c.json({ error: "You have already connected an app today." }, 429);
    if (outsideAppsToday(db) >= NEW_APPS_PER_DAY) return c.json({ error: "Today's free spots are taken. Try again tomorrow." }, 429);
    if (repo && !(await isPublicRepo(repo))) return c.json({ error: `We could not read ${repo}. Is it public? For a private repository, install our GitHub app after connecting.` }, 400);

    const made = createOutsideApp(db, name, repo);
    const bot = await getBotUsername();
    return c.json({
      project: made.name,
      dsn: made.dsn,
      logs_url: made.logs_url,
      telegram: bot ? `https://t.me/${bot}?start=${made.link_code}` : null,
      link_code: made.link_code,
    });
  });

  return app;
}
