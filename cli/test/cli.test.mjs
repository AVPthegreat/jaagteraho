// The setup command on small sample apps: it finds the framework, makes valid code changes,
// does nothing twice, and sends a test error in the SDK's envelope format.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { detect } from "../lib/detect.mjs";
import { applyPlan, makePlan } from "../lib/plan.mjs";
import { parseDsn, sendTestError } from "../lib/send.mjs";

const DSN = "https://0123456789abcdef0123456789abcdef@jr.example.com/123456";

function app(files) {
  const root = mkdtempSync(join(tmpdir(), "jr-cli-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

const pyOk = (file) => spawnSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", file]).status === 0;
const jsOk = (file) => spawnSync(process.execPath, ["--check", file]).status === 0;

function run(root) {
  const a = detect(root);
  const plan = makePlan(root, a, DSN);
  applyPlan(plan);
  return { a, plan };
}

describe("setup command", () => {
  it("Django: adds the SDK to settings and requirements, once", () => {
    const root = app({
      "manage.py": "import os\n",
      "shop/settings.py": "DEBUG = False\nINSTALLED_APPS = ['django.contrib.admin']\n",
      "requirements.txt": "Django==5.1\n",
    });
    const { a } = run(root);
    assert.equal(a.framework, "django");
    const s = readFileSync(join(root, "shop/settings.py"), "utf8");
    assert.match(s, /_jr_sentry\.init\(dsn=_jr_os\.environ\.get\("SENTRY_DSN", "https:\/\/0123/);
    assert.ok(pyOk(join(root, "shop/settings.py")));
    assert.match(readFileSync(join(root, "requirements.txt"), "utf8"), /sentry-sdk>=2/);
    const again = makePlan(root, detect(root), DSN);
    assert.equal(again.changes.length, 0, "running twice changes nothing");
  });

  it("Flask: starts the SDK before the app is created, after the docstring", () => {
    const root = app({ "app.py": '"""My app."""\nfrom __future__ import annotations\nfrom flask import Flask\napp = Flask(__name__)\n', "requirements.txt": "flask\n" });
    const { a } = run(root);
    assert.equal(a.framework, "flask");
    const t = readFileSync(join(root, "app.py"), "utf8");
    assert.ok(t.indexOf("_jr_sentry.init") < t.indexOf("Flask(__name__)"));
    assert.ok(t.startsWith('"""My app."""\nfrom __future__ import annotations\n'));
    assert.ok(pyOk(join(root, "app.py")));
  });

  it("FastAPI: finds the module that creates the app", () => {
    const root = app({ "pyproject.toml": '[project]\ndependencies = ["fastapi"]\n', "src/api/main.py": "from fastapi import FastAPI\napp = FastAPI()\n", "src/api/util.py": "x = 1\n" });
    const { a, plan } = run(root);
    assert.equal(a.framework, "fastapi");
    assert.match(readFileSync(join(root, "src/api/main.py"), "utf8"), /_jr_sentry\.init/);
    assert.ok(plan.manual.some((m) => /Add sentry-sdk/.test(m)));
  });

  it("Express (CommonJS): instrument file loaded first, error handler before listen", () => {
    const root = app({
      "package.json": JSON.stringify({ main: "server.js", dependencies: { express: "^4" } }),
      "server.js": "'use strict';\nconst express = require('express');\nconst app = express();\napp.get('/', (q, r) => r.send('hi'));\napp.listen(3000);\n",
    });
    const { a, plan } = run(root);
    assert.equal(a.framework, "express");
    const t = readFileSync(join(root, "server.js"), "utf8");
    assert.match(t.split("\n")[1], /require\("\.\/instrument\.js"\)/);
    assert.ok(t.indexOf("Sentry.setupExpressErrorHandler(app)") < t.indexOf("app.listen(3000)"));
    assert.ok(jsOk(join(root, "server.js")) && jsOk(join(root, "instrument.js")));
    assert.deepEqual(plan.install, ["npm", "install", "@sentry/node"]);
  });

  it("Express (ES modules, pnpm): uses import and the right package manager", () => {
    const root = app({
      "package.json": JSON.stringify({ type: "module", scripts: { start: "node src/index.js" }, dependencies: { express: "^5" } }),
      "pnpm-lock.yaml": "",
      "src/index.js": "import express from 'express';\nconst server = express();\nserver.listen(8080);\n",
    });
    const { plan } = run(root);
    const t = readFileSync(join(root, "src/index.js"), "utf8");
    assert.match(t.split("\n")[0], /^import Sentry from "\.\/instrument\.js";/);
    assert.match(t, /Sentry\.setupExpressErrorHandler\(server\);[^\n]*\nserver\.listen/);
    assert.match(readFileSync(join(root, "src/instrument.js"), "utf8"), /^import \* as Sentry from "@sentry\/node";/m);
    assert.deepEqual(plan.install, ["pnpm", "add", "@sentry/node"]);
  });

  it("Next.js: creates instrumentation.ts in src when the app lives there", () => {
    const root = app({ "package.json": JSON.stringify({ dependencies: { next: "16.0.0" } }), "src/app/page.tsx": "export default function P() { return null }\n" });
    const { a } = run(root);
    assert.equal(a.framework, "next");
    assert.match(readFileSync(join(root, "src/instrumentation.ts"), "utf8"), /onRequestError = Sentry\.captureRequestError/);
  });

  it("an app that already starts Sentry is left alone", () => {
    const root = app({ "manage.py": "", "web/settings.py": "INSTALLED_APPS = []\nimport sentry_sdk\nsentry_sdk.init(dsn=os.environ['SENTRY_DSN'])\n" });
    const plan = makePlan(root, detect(root), DSN);
    assert.equal(plan.changes.filter((c) => c.file.endsWith("settings.py")).length, 0);
    assert.ok(plan.manual.some((m) => /already starts the Sentry SDK/.test(m)));
  });

  it("parses DSNs, including ones with a path prefix", () => {
    assert.equal(parseDsn(DSN).envelopeUrl, "https://jr.example.com/api/123456/envelope/");
    assert.equal(parseDsn("https://k@h.io/sub/9").envelopeUrl, "https://h.io/sub/api/9/envelope/");
    assert.equal(parseDsn("nonsense"), null);
  });

  it("sends a test error in the envelope format, tagged as a test", async () => {
    let got = null;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        got = { url: req.url, auth: req.headers["x-sentry-auth"], body };
        res.end("{}");
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    const r = await sendTestError(`http://abc@127.0.0.1:${port}/42`, "python");
    server.close();
    assert.equal(r.ok, true);
    assert.equal(got.url, "/api/42/envelope/");
    assert.match(got.auth, /sentry_key=abc/);
    const [, item, payload] = got.body.split("\n");
    assert.equal(JSON.parse(item).length, Buffer.byteLength(payload));
    assert.equal(JSON.parse(payload).tags.jr_test, "1");
  });
});

describe("DSN check before anything is written", () => {
  it("accepts real DSN shapes, with a port or a path prefix", async () => {
    const { validDsn } = await import("../lib/plan.mjs");
    for (const ok of [DSN, "http://abc123@127.0.0.1:8787/42", "https://k@host.example/sentry/7", "https://k@o1.ingest.sentry.io/4506/"]) assert.ok(validDsn(ok), ok);
  });

  it("refuses a DSN that would break out of the string written into the app", () => {
    for (const bad of ['https://k@h/1", __import__("os").system("x"), "', "https://k@h/1`;process.exit()//", "https://k@h/$(id)/1", "https://k@h/1\\", "not a dsn", ""]) {
      assert.throws(() => makePlan(app({ "manage.py": "", "web/settings.py": "INSTALLED_APPS = []\n" }), { language: "python", framework: "django" }, bad), /does not look like a DSN/, bad);
    }
  });
});
