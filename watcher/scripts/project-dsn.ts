// Prints the SENTRY_DSN for an existing project at the current public address, and a fresh
// Telegram link code. Use it after moving the watcher (for example from a tunnel to Vultr).
// Usage: npm run project:dsn -- <name>

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { openDb } from "../src/db/db.js";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run project:dsn -- <name>");
  process.exit(1);
}
const dataDir = process.env.JR_DATA_DIR ?? new URL("../data/", import.meta.url).pathname;
const db = openDb(`${dataDir}/jaagteraho.db`);
const p = db.prepare("SELECT id, public_key FROM projects WHERE name = ? ORDER BY id DESC LIMIT 1").get(name) as { id: number; public_key: string } | undefined;
if (!p) {
  console.error(`No project called "${name}".`);
  process.exit(1);
}
const base = new URL(process.env.JR_PUBLIC_INTAKE_URL ?? "http://127.0.0.1:8787");
const code = randomBytes(6).toString("hex");
db.prepare("INSERT INTO link_codes (code, project_id, expires_at) VALUES (?, ?, ?)").run(code, p.id, new Date(Date.now() + 7 * 86_400_000).toISOString());
console.log(`SENTRY_DSN=${base.protocol}//${p.public_key}@${base.host}/${p.id}`);
console.log(`LINK_CODE=${code}`);
