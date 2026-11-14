// Registers an app to watch, prints the SENTRY_DSN line for it and a Telegram link code.
// Usage: npm run project:add -- <name> <faurus|sandbox|paste> [local:/path | owner/repo]

import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { openDb, type ProjectSettings } from "../src/db/db.js";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [name, kind, repo] = process.argv.slice(2);
if (!name || !["faurus", "sandbox", "paste"].includes(kind ?? "")) {
  console.error("Usage: npm run project:add -- <name> <faurus|sandbox|paste> [local:/path | owner/repo]");
  process.exit(1);
}

const dataDir = process.env.JR_DATA_DIR ?? new URL("../data/", import.meta.url).pathname;
mkdirSync(dataDir, { recursive: true });
const db = openDb(`${dataDir}/jaagteraho.db`);

const SANDBOX: ProjectSettings = {
  critical: [
    { name: "code submission", match: "/api/submit" },
    { name: "exam start", match: "/api/exam/start" },
    { name: "fee payment", match: "/api/pay" },
  ],
};
const FAURUS: ProjectSettings = {
  critical: [
    { name: "code submission", match: "/api/submission" },
    { name: "exam", match: "/api/exam" },
    { name: "contest", match: "/api/contest" },
    { name: "payment", match: "/api/payment" },
    { name: "login", match: "/api/login" },
  ],
};
const settings = kind === "sandbox" ? SANDBOX : kind === "faurus" ? FAURUS : {};

const id = randomInt(100_000, 999_999);
const key = randomBytes(16).toString("hex");
const now = new Date();
db.prepare(
  "INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
).run(id, name, key, kind, repo ?? null, kind === "sandbox" ? "sandbox-write" : "read", JSON.stringify(settings), now.toISOString());

const code = randomBytes(6).toString("hex");
db.prepare("INSERT INTO link_codes (code, project_id, expires_at) VALUES (?, ?, ?)").run(code, id, new Date(now.getTime() + 7 * 86_400_000).toISOString());

const base = new URL(process.env.JR_PUBLIC_INTAKE_URL ?? "http://127.0.0.1:8787");
console.log(`Project "${name}" added (id ${id}).`);
console.log(`SENTRY_DSN=${base.protocol}//${key}@${base.host}/${id}`);
console.log(`LINK_CODE=${code}`);
let bot: string | null = null;
if (process.env.JR_TELEGRAM_BOT_TOKEN) {
  const me = (await fetch(`https://api.telegram.org/bot${process.env.JR_TELEGRAM_BOT_TOKEN}/getMe`).then((r) => r.json()).catch(() => null)) as { result?: { username?: string } } | null;
  bot = me?.result?.username ?? null;
}
console.log(bot ? `To get alerts, open https://t.me/${bot}?start=${code} and tap Start.` : `To get alerts, send this to the bot on Telegram: /start ${code}`);
