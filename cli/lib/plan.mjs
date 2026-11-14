// Builds the list of file changes for an app, shows them, and applies them. Nothing is written
// until the person says yes (or passes --yes). Every added block is marked so it is easy to remove.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const MARK = "JaagteRaho: errors go to your AI night watchman";
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function pythonBlock(dsn, framework) {
  // Flask names errors after the view function by default; the URL is what /critical routes match.
  const flask = framework === "flask";
  return [
    "",
    `# ${MARK}. Remove these lines to stop. Set SENTRY_DSN to an empty value to switch it off locally.`,
    "import os as _jr_os",
    "import sentry_sdk as _jr_sentry",
    ...(flask ? ["from sentry_sdk.integrations.flask import FlaskIntegration as _JrFlask"] : []),
    "",
    `_jr_sentry.init(dsn=_jr_os.environ.get("SENTRY_DSN", "${dsn}"), send_default_pii=False, traces_sample_rate=0${flask ? ', integrations=[_JrFlask(transaction_style="url")]' : ""})`,
    "",
  ].join("\n");
}

/** Python files: add after the docstring and `from __future__` lines, before the app is created. */
function insertPythonTop(text, block) {
  const lines = text.split("\n");
  let i = 0;
  if (/^\s*("""|''')/.test(lines[0] ?? "")) {
    const q = lines[0].trim().slice(0, 3);
    if (!(lines[0].trim().length > 3 && lines[0].trim().endsWith(q))) {
      i = 1;
      while (i < lines.length && !lines[i].includes(q)) i++;
    }
    i++;
  }
  while (i < lines.length && /^(#!|# -\*-|from __future__)/.test(lines[i])) i++;
  return [...lines.slice(0, i), block.trimEnd(), "", ...lines.slice(i)].join("\n");
}

function nodeInstrument(dsn, esm) {
  const init = `Sentry.init({ dsn: process.env.SENTRY_DSN ?? "${dsn}", sendDefaultPii: false, tracesSampleRate: 0 });`;
  return esm
    ? `// ${MARK}. Delete this file and its import to stop.\nimport * as Sentry from "@sentry/node";\n\n${init}\n\nexport default Sentry;\n`
    : `// ${MARK}. Delete this file and its require to stop.\nconst Sentry = require("@sentry/node");\n\n${init}\n\nmodule.exports = Sentry;\n`;
}

function insertNodeTop(text, line) {
  const lines = text.split("\n");
  let i = 0;
  if (lines[0]?.startsWith("#!")) i++;
  while (i < lines.length && /^\s*(["']use strict["'];?)\s*$/.test(lines[i])) i++;
  return [...lines.slice(0, i), line, ...lines.slice(i)].join("\n");
}

/**
 * Returns { changes: [{ file, action, content, summary }], install: string[] | null, manual: string[] }.
 * action is "create" or "update"; content is the whole new file.
 */
export function makePlan(root, app, dsn) {
  const changes = [];
  const manual = [];
  let install = null;
  const already = (t) => t.includes(MARK) || /sentry_sdk\.init|Sentry\.init\(/.test(t);

  if (app.language === "python") {
    if (!app.entry) {
      manual.push("Could not find where your app starts. Add this near the top of your main module:", pythonBlock(dsn));
    } else {
      const text = read(app.entry);
      if (already(text)) {
        manual.push(`${relative(root, app.entry)} already starts the Sentry SDK. Just set SENTRY_DSN=${dsn} where the app runs.`);
      } else {
        const block = pythonBlock(dsn, app.framework);
        const next = app.framework === "django" ? `${text.trimEnd()}\n${block}` : insertPythonTop(text, block);
        changes.push({ file: app.entry, action: "update", content: next, summary: `start the error package (${app.framework})` });
      }
    }
    const req = join(root, "requirements.txt");
    if (existsSync(req)) {
      const t = read(req);
      if (!/^sentry[-_]sdk/im.test(t)) changes.push({ file: req, action: "update", content: `${t.trimEnd()}\nsentry-sdk>=2\n`, summary: "add sentry-sdk" });
    } else if (!/sentry[-_]sdk/i.test(read(join(root, "pyproject.toml")))) {
      manual.push("Add sentry-sdk to your dependencies (for example: pip install sentry-sdk, or poetry add sentry-sdk).");
    }
    install = ["pip", "install", "sentry-sdk"];
    return { changes, install, manual, installNote: "Install it in the environment your app runs in." };
  }

  if (app.framework === "next") {
    const pkgName = "@sentry/nextjs";
    const existing = read(app.entry);
    if (existing && already(existing)) manual.push(`${relative(root, app.entry)} already starts Sentry. Just set SENTRY_DSN=${dsn}.`);
    else if (existing) manual.push(`You already have ${relative(root, app.entry)}. Add inside register(): Sentry.init({ dsn: process.env.SENTRY_DSN ?? "${dsn}" }) and export const onRequestError = Sentry.captureRequestError.`);
    else
      changes.push({
        file: app.entry,
        action: "create",
        content: `// ${MARK}. Delete this file to stop.\nimport * as Sentry from "${pkgName}";\n\nexport async function register() {\n  Sentry.init({ dsn: process.env.SENTRY_DSN ?? "${dsn}", sendDefaultPii: false, tracesSampleRate: 0 });\n}\n\n// Sends errors from server components, route handlers and server actions.\nexport const onRequestError = Sentry.captureRequestError;\n`,
        summary: "start the error package on the server (Next.js instrumentation)",
      });
    install = packageAdd(root, pkgName);
    return { changes, install, manual };
  }

  if (app.language === "javascript") {
    install = packageAdd(root, "@sentry/node");
    if (!app.entry) {
      manual.push("Could not find your server's entry file. Create instrument.js with:", nodeInstrument(dsn, app.esm), "and load it first thing in your server.");
      return { changes, install, manual };
    }
    const text = read(app.entry);
    if (already(text)) {
      manual.push(`${relative(root, app.entry)} already starts Sentry. Just set SENTRY_DSN=${dsn}.`);
      return { changes, install, manual };
    }
    const ts = app.entry.endsWith(".ts");
    const esm = app.esm || ts || /^\s*import\s/m.test(text);
    const instrument = join(dirname(app.entry), ts ? "instrument.ts" : esm && !app.esm ? "instrument.mjs" : "instrument.js");
    if (!existsSync(instrument)) changes.push({ file: instrument, action: "create", content: nodeInstrument(dsn, esm), summary: "start the error package" });
    const spec = `./${basename(instrument).replace(/\.ts$/, ts ? "" : ".ts")}`;
    let next = insertNodeTop(text, esm ? `import Sentry from "${spec}"; // ${MARK}` : `const Sentry = require("${spec}"); // ${MARK}`);
    if (app.framework === "express") {
      const name = text.match(/(?:const|let|var)\s+(\w+)\s*=\s*express\(\s*\)/)?.[1];
      const listen = name ? new RegExp(`^(\\s*)${name}\\.listen\\(`, "m") : null;
      if (name && listen && listen.test(next)) {
        next = next.replace(listen, (m0, indent) => `${indent}Sentry.setupExpressErrorHandler(${name}); // ${MARK}\n${m0}`);
      } else {
        manual.push("Add Sentry.setupExpressErrorHandler(app) after your routes and before other error handlers, so Express errors are reported.");
      }
    }
    changes.push({ file: app.entry, action: "update", content: next, summary: app.framework === "express" ? "load it first and report Express errors" : "load it first" });
    return { changes, install, manual };
  }

  return { changes, install, manual: ["No Python or JavaScript app found in this folder. Run this in your project's root folder."] };
}

function packageAdd(root, name) {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return ["pnpm", "add", name];
  if (existsSync(join(root, "yarn.lock"))) return ["yarn", "add", name];
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return ["bun", "add", name];
  return ["npm", "install", name];
}

export function applyPlan(plan) {
  for (const c of plan.changes) writeFileSync(c.file, c.content);
}

/** A short line-by-line preview of what each change adds. */
export function preview(root, plan) {
  const out = [];
  for (const c of plan.changes) {
    const before = read(c.file).split("\n");
    const added = c.content.split("\n").filter((l) => !before.includes(l) && l.trim());
    out.push(`${c.action === "create" ? "create" : "update"} ${relative(root, c.file)}: ${c.summary}`);
    for (const l of added.slice(0, 8)) out.push(`    + ${l}`);
  }
  return out.join("\n");
}
