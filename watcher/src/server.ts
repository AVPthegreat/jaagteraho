// Starts the watcher: intake, worker, Telegram bot and (later) the public API, in one process.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { existsSync, mkdirSync } from "node:fs";
import { makeAI } from "./ai/claude.js";
import { openDb } from "./db/db.js";
import { intakeRoutes } from "./intake/route.js";
import { Worker } from "./pipeline/worker.js";
import { Healer } from "./pipeline/heal.js";
import { Telegram } from "./telegram/api.js";
import { Bot } from "./telegram/bot.js";
import { publicRoutes } from "./web/public.js";
import { playgroundRoutes } from "./web/playground.js";
import { Playground } from "./playground/runner.js";
import { runnerMode } from "./runner/client.js";
import { pasteRoutes } from "./web/paste.js";
import { ownerRoutes } from "./web/owner.js";
import { connectRoutes } from "./web/connect.js";
import { githubRoutes } from "./github/app.js";
import { logRoutes } from "./intake/logs.js";
import { cors } from "hono/cors";
import { bodyLimits } from "./web/limits.js";
import { makeVoice } from "./voice/voice.js";
import { makePhone } from "./phone/phone.js";
import { ensureSelfProject, reportSelf } from "./selfwatch.js";
import { fileURLToPath } from "node:url";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const dataDir = process.env.JR_DATA_DIR ?? new URL("../data/", import.meta.url).pathname;
mkdirSync(dataDir, { recursive: true });
const db = openDb(`${dataDir}/jaagteraho.db`);

const selfId = ensureSelfProject(db, fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, ""));
process.on("unhandledRejection", (e) => {
  console.error("unhandled rejection:", e);
  reportSelf(db, e, "process: unhandled rejection");
});
process.on("uncaughtException", (e) => {
  console.error("uncaught exception:", e);
  reportSelf(db, e, "process: uncaught exception");
  process.exit(1); // the queue is on disk; Docker restarts the process
});

const ai = makeAI(db);
const tg = process.env.JR_TELEGRAM_BOT_TOKEN ? new Telegram(process.env.JR_TELEGRAM_BOT_TOKEN) : null;
const voice = makeVoice(`${dataDir}/voice`);
const phone = makePhone(db);
const worker = new Worker(db, ai, tg, voice, phone);
const twinBroken = process.env.JR_TWIN_BROKEN_URL ?? "http://127.0.0.1:8001";
const twinFixed = process.env.JR_TWIN_FIXED_URL ?? "http://127.0.0.1:8002";
const healer = new Healer(db, tg, { twinFixed });
worker.healer = healer;
worker.start();
healer.start();
const bot = tg && process.env.JR_BOT !== "off" ? new Bot(db, tg, worker) : null;
void bot?.run();

const app = new Hono();
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path}:`, err);
  reportSelf(db, err, `${c.req.method} ${c.req.routePath || c.req.path}`);
  return c.json({ error: "Something went wrong on our side. It has been reported." }, 500);
});
// Before every route: no handler may read an unbounded body (256 KB, 1 MB on /logs/*).
app.use("*", bodyLimits());
app.get("/health", (c) => c.json({ ok: true, watching_itself_as: selfId }));
app.route("/", intakeRoutes({ db }));
app.route(
  "/",
  logRoutes(db, undefined, {
    told: (projectId, hash) => worker.slowScanTold(projectId, hash),
    report: (r) => void worker.slowScan(r).catch((e) => console.error("slow scan:", e)),
  }),
);
app.use("/public/paste*", cors({ origin: (process.env.JR_SITE_ORIGINS ?? "http://localhost:3000").split(",").filter(Boolean), allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"] }));
app.route("/", pasteRoutes(db, ai));
app.route("/", ownerRoutes(db));
app.use("/public/connect", cors({ origin: (process.env.JR_SITE_ORIGINS ?? "http://localhost:3000").split(",").filter(Boolean), allowMethods: ["POST"], allowHeaders: ["Content-Type"] }));
app.route("/", connectRoutes(db));
app.route("/", githubRoutes(db, tg));
if (phone) app.route("/", phone.routes((id) => worker.acknowledgedByPhone(id)));
app.route(
  "/",
  publicRoutes({
    db,
    voice,
    twinBroken,
    twinFixed,
    healer,
    allowedOrigins: (process.env.JR_SITE_ORIGINS ?? "http://localhost:3000").split(",").filter(Boolean),
  }),
);

// The Live playground: real bugs planted into our live apps, handled by the real pipeline (playground/runner.ts).
// It needs the isolated runner (JR_RUNNER_SOCKET), because it runs app code and AI-written fixes; without
// one it stays off. JR_PLAYGROUND=off turns it off; it is also off when the bench folder is missing.
let playground: Playground | null = null;
try {
  if (process.env.JR_PLAYGROUND === "off") console.log("playground off: JR_PLAYGROUND=off");
  else if (!runnerMode()) console.log("playground off: no isolated runner (JR_RUNNER_SOCKET)");
  else playground = new Playground(db, ai);
} catch (e) {
  console.error("playground off:", String(e));
}
if (playground) {
  playground.start();
  app.route("/", playgroundRoutes(playground, (process.env.JR_SITE_ORIGINS ?? "http://localhost:3000").split(",").filter(Boolean)));
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname: host }, () =>
  console.log(`JaagteRaho watcher on http://${host}:${port} · AI ${ai ? "on" : "off"} · Telegram ${bot ? "on" : "off"} · voice ${voice ? "on" : "off"} · phone ${phone ? "on" : "off"}`),
);

const shutdown = () => {
  bot?.stop();
  worker.stop();
  healer.stop();
  playground?.stop();
  db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
