#!/usr/bin/env node
// npx jaagteraho init   connect this app (adds the open-source Sentry SDK, points it at JaagteRaho, sends a test)
// npx jaagteraho test   send a test error to check the connection

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { detect } from "../lib/detect.mjs";
import { applyPlan, makePlan, preview } from "../lib/plan.mjs";
import { sendTestError } from "../lib/send.mjs";
import { serverUrl } from "../lib/server.mjs";

const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith("-") ? args[0] : "init";
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : undefined;
};
const yes = flag("yes") === true || flag("y") === true;
const root = process.cwd();
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

async function ask(question, fallback = "") {
  if (yes || !process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(question)).trim();
  rl.close();
  return a || fallback;
}

function gitRepo() {
  const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" });
  const m = r.stdout?.trim().match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

function dsnFromEnvFile() {
  for (const f of [".env", ".env.local", ".env.production"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^SENTRY_DSN\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
  }
  return null;
}

async function showQr(url) {
  try {
    const qr = (await import("qrcode-terminal")).default;
    qr.generate(url, { small: true }, (code) => console.log(code));
  } catch {
    /* the link below is enough */
  }
  console.log(`  ${url}\n`);
}

async function register(server, name, repo) {
  const res = await fetch(`${server}/public/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: `cli-${randomBytes(8).toString("hex")}`, name, repo: repo ?? "", consent: true }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: `Could not reach ${server} (${e?.cause?.code ?? e?.name}).` }) }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
  return body;
}

async function init() {
  console.log(`\n${bold("JaagteRaho")}: connect this app to your AI night watchman\n`);
  const app = detect(root);
  if (!app.framework) {
    console.log("No Python or JavaScript app found here. Run this in your project's root folder.");
    process.exit(1);
  }
  console.log(`Found: ${bold(app.framework)} app${app.entry ? ` (${app.entry.slice(root.length + 1)})` : ""}`);

  let dsn = typeof flag("dsn") === "string" ? flag("dsn") : null;
  let telegram = null;
  if (!dsn) {
    // The hosted server (lib/server.mjs); --server or JAAGTERAHO_URL for self-hosting.
    const server = serverUrl(flag("server"));
    const repo = gitRepo();
    const name = await ask(`App name ${dim(`(${basename(root)})`)}: `, basename(root));
    console.log(
      dim(
        `\nJaagteRaho keeps only the error type, a masked message, the route and code lines from the stack trace.\nNo request bodies, headers, cookies, user details or local variables. ${repo ? `It reads ${repo} (public) to explain causes and never writes to it.` : ""}`,
      ),
    );
    const ok = (await ask("Connect? (Y/n) ", "y")).toLowerCase();
    if (ok.startsWith("n")) process.exit(0);
    try {
      const made = await register(server, name, repo);
      dsn = made.dsn;
      telegram = made.telegram;
      console.log(`Created ${bold(made.project)}.`);
    } catch (e) {
      console.log(`\n${e.message}\nYou can also connect from Telegram: send /new ${name} to the JaagteRaho bot, then run this again with --dsn.`);
      process.exit(1);
    }
  }

  let plan;
  try {
    plan = makePlan(root, app, dsn);
  } catch (e) {
    console.log(`\n${e.message}\nNothing was changed.`);
    process.exit(1);
  }
  if (plan.changes.length) {
    console.log(`\nChanges:\n${preview(root, plan)}\n`);
    const go = (await ask("Apply these changes? (Y/n) ", "y")).toLowerCase();
    if (go.startsWith("n")) process.exit(0);
    applyPlan(plan);
    console.log("Done.");
  }
  for (const m of plan.manual) console.log(`\n${m}`);

  if (plan.install && flag("no-install") !== true) {
    const cmdline = plan.install.join(" ");
    // A project virtual environment means we know where the app's packages live.
    const venvPip = ["venv", ".venv", "env"].map((d) => join(root, d, process.platform === "win32" ? "Scripts/pip.exe" : "bin/pip")).find(existsSync);
    if (app.language === "python" && venvPip) {
      const go = (await ask(`\nInstall sentry-sdk into ${venvPip.slice(root.length + 1).split(/[\\/]/)[0]}? (Y/n) `, "y")).toLowerCase();
      if (!go.startsWith("n")) {
        const r = spawnSync(venvPip, ["install", "--quiet", "sentry-sdk"], { cwd: root, stdio: "inherit" });
        if (r.status !== 0) console.log(`That failed. Run it yourself: ${cmdline}`);
      }
    } else if (app.language === "python") {
      console.log(`\nInstall the error package: ${bold(cmdline)}${plan.installNote ? ` ${dim(plan.installNote)}` : ""}`);
    } else {
      const go = (await ask(`\nRun ${cmdline}? (Y/n) `, "y")).toLowerCase();
      if (!go.startsWith("n")) {
        const r = spawnSync(plan.install[0], plan.install.slice(1), { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
        if (r.status !== 0) console.log(`That failed. Run it yourself: ${cmdline}`);
      }
    }
  }

  if (telegram) {
    console.log(`\n${bold("Get alerts on Telegram:")} scan this or open the link, then tap Start.`);
    await showQr(telegram);
  }

  if (flag("no-test") !== true) await test(dsn, app.language);
  console.log(`\nLast step: commit and deploy as you normally do. From then on, real errors reach you on Telegram.\n`);
}

async function test(dsn = typeof flag("dsn") === "string" ? flag("dsn") : process.env.SENTRY_DSN || dsnFromEnvFile(), language = null) {
  if (!dsn) {
    console.log("No SENTRY_DSN found. Pass --dsn, or set SENTRY_DSN.");
    process.exit(1);
  }
  const r = await sendTestError(dsn, language ?? "other");
  console.log(r.ok ? `\nTest error sent. ${bold("You should get a ✅ on Telegram")} within a few seconds (once you've tapped Start).` : `\nTest failed: ${r.error}`);
  if (!r.ok) process.exitCode = 1;
}

if (cmd === "init") await init();
else if (cmd === "test") await test();
else {
  console.log("Usage:\n  npx jaagteraho init [--dsn <SENTRY_DSN>] [--yes] [--no-install] [--no-test]\n  npx jaagteraho test [--dsn <SENTRY_DSN>]");
  process.exit(cmd === "help" || cmd === "--help" ? 0 : 1);
}
