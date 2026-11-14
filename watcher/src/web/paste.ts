// Paste-an-error: an outside developer pastes a Python traceback and a public GitHub repository.
// We read the files the traceback names (no permission needed), diagnose, and show a diff.
// Nothing is written anywhere. Capped per visitor and per day.

import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { spendContext, type AI } from "../ai/claude.js";
import type { DB } from "../db/db.js";
import type { CleanFrame } from "../intake/allowlist.js";
import { clip, mask } from "../intake/mask.js";
import { runDiagnosis, traceFiles } from "../pipeline/diagnose.js";
import { runGate } from "../pipeline/gate.js";
import { relatedFiles } from "../source/related.js";
import { GitHubSource } from "../source/source.js";
import { clientIp, Window } from "./public.js";
import { parseV8Stack } from "../selfwatch.js";

const ipLimits = new Window();

export const PER_VISITOR_PER_DAY = 3;
export const PER_DAY = 30;
const MAX_TRACEBACK = 20_000;

export const PASTE_SCHEMA = `
CREATE TABLE IF NOT EXISTS pastes (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  repo       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  result     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pastes_session ON pastes(session_id, created_at);
`;

export type ParsedTraceback = { exception_type: string; message: string; frames: CleanFrame[] };

/** Reads a standard Python traceback into frames, oldest first. */
export function parsePythonTraceback(text: string): ParsedTraceback | null {
  // pytest prints internal errors with "INTERNALERROR> " before every line.
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/^INTERNALERROR>\s?/, ""));
  const frames: CleanFrame[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m = lines[i].match(/^\s*File "([^"]+)", line (\d+), in (.+)$/);
    let code = m && lines[i + 1] && !/^\s*File "/.test(lines[i + 1]) ? lines[i + 1].trim() : null;
    if (!m) {
      // IPython / Jupyter: "File ~/path/x.py:114, in func(args)" and the failing line marked "--> 114 code".
      const ip = lines[i].match(/^\s*File (\S+\.py):(\d+), in ([\w.<>]+)/);
      if (!ip) continue;
      m = ip;
      code = null;
      for (let j = i + 1; j < lines.length && !/^\s*File /.test(lines[j]); j++) {
        const arrow = lines[j].match(/^-+>\s*\d+\s(.*)$/);
        if (arrow) {
          code = arrow[1].trim();
          break;
        }
      }
    }
    const path = m[1].replace(/^~\//, "/home/user/");
    frames.push({
      filename: path.split("/").slice(-2).join("/"),
      abs_path: path,
      module: null,
      function: m[3].trim(),
      lineno: Number(m[2]),
      in_app: !/site-packages|dist-packages|\/lib\/python\d|<frozen|^<string>/.test(path),
      context_line: code ? clip(mask(code), 300) : null,
      pre_context: [],
      post_context: [],
    });
  }
  const last = [...lines].reverse().find((l) => /^[A-Za-z_][\w.]*(Error|Exception|Exit|Interrupt|Warning)\b|^[A-Za-z_][\w.]*:/.test(l.trim()));
  if (frames.length === 0 || !last) return null;
  const [type, ...rest] = last.trim().split(":");
  return { exception_type: clip(type.trim(), 120), message: clip(mask(rest.join(":").trim()), 500), frames: frames.slice(-30) };
}

/** Reads a Node.js or browser (V8) stack trace: "TypeError: msg" then "at fn (path:line:col)" lines. */
export function parseJsStack(text: string): ParsedTraceback | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());
  const head = lines.find((l) => /^\s*(?:Uncaught\s+)?[A-Z]\w*(?:Error|Exception)\b.*$/.test(l) || /^\s*(?:Uncaught\s+)?\w+: /.test(l));
  const frames = parseV8Stack(lines.filter((l) => /^\s*at /.test(l)).join("\n")).map((f) => {
    // Turn deployed URLs into paths (https://site/_next/static/... or webpack:///./src/x.ts).
    const p = (f.abs_path ?? "").replace(/^webpack:\/\/\/?(?:\.\/)?/, "").replace(/^https?:\/\/[^/]+\//, "");
    const lib = /node_modules|_next\/static\/chunks|^node:|^internal\//.test(p);
    return { ...f, abs_path: p, filename: p.split("/").slice(-2).join("/"), in_app: !lib };
  });
  if (!head || frames.length === 0) return null;
  const clean = head.trim().replace(/^Uncaught\s+/, "");
  const colon = clean.indexOf(":");
  const type = colon > 0 ? clean.slice(0, colon) : clean;
  const message = colon > 0 ? clean.slice(colon + 1).trim() : "";
  return { exception_type: clip(type, 120), message: clip(mask(message), 500), frames };
}

export const parseTraceback = (text: string) => parsePythonTraceback(text) ?? parseJsStack(text);

export function parseRepo(url: string): string | null {
  const m = url.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?(?:[#?].*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Uses up one of the visitor's and the day's paste slots, or says which limit is reached. The check and
 * the row are one transaction (better-sqlite3 runs it synchronously), so parallel requests cannot overrun.
 */
export function reservePaste(db: DB, session: string, repo: string, now = Date.now()): { id: string } | "visitor" | "day" {
  return db.transaction(() => {
    const since = new Date(now - 86_400_000).toISOString();
    const mine = (db.prepare("SELECT COUNT(*) AS n FROM pastes WHERE session_id = ? AND created_at > ?").get(session, since) as { n: number }).n;
    if (mine >= PER_VISITOR_PER_DAY) return "visitor" as const;
    const all = (db.prepare("SELECT COUNT(*) AS n FROM pastes WHERE created_at > ?").get(since) as { n: number }).n;
    if (all >= PER_DAY) return "day" as const;
    const id = `pending-${randomBytes(6).toString("hex")}`;
    db.prepare("INSERT INTO pastes (id, session_id, repo, created_at, result) VALUES (?, ?, ?, ?, ?)").run(id, session, repo, new Date(now).toISOString(), JSON.stringify({ pending: true }));
    return { id };
  }).immediate();
}

export function pasteRoutes(db: DB, ai: AI | null) {
  db.exec(PASTE_SCHEMA);
  const app = new Hono();

  app.post("/public/paste", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: string; traceback?: string; repo?: string };
    const session = typeof body.session === "string" ? body.session : "";
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(session)) return c.json({ error: "Reload the page and try again." }, 400);
    const repo = typeof body.repo === "string" ? parseRepo(body.repo) : null;
    if (!repo) return c.json({ error: "Give a public GitHub repository link, like https://github.com/owner/name." }, 400);
    const tb = (typeof body.traceback === "string" ? body.traceback : "").slice(0, MAX_TRACEBACK);
    const parsed = parseTraceback(tb);
    if (!parsed) return c.json({ error: "That does not look like a Python traceback or a JavaScript stack trace. Paste the whole error, from the first line to the last." }, 400);
    if (!ai) return c.json({ error: "Diagnosis is switched off right now." }, 503);

    if (!ipLimits.peek(clientIp(c), PER_VISITOR_PER_DAY * 2, 86_400_000)) return c.json({ error: "Too many diagnoses from this network today. Try again tomorrow." }, 429);
    // The paste budget (ai/claude.ts) is checked before a slot or a GitHub fetch is used up.
    if (spendContext.run({ projectId: 0, lane: "paste" }, () => ai.guard.pick(ai.diagnosisModel, ai.decisionModel)) === null)
      return c.json({ error: "Today's free diagnoses are used up. Try again tomorrow." }, 429);
    // The quota check and the row that uses it up are one transaction, so parallel requests cannot all
    // pass the check while the first diagnosis is still running. Every attempt that reaches GitHub counts.
    const slot = reservePaste(db, session, repo);
    if (slot === "visitor") return c.json({ error: `You have used your ${PER_VISITOR_PER_DAY} diagnoses for today.` }, 429);
    if (slot === "day") return c.json({ error: "Today's free diagnoses are used up. Try again tomorrow." }, 429);
    ipLimits.allow(clientIp(c), PER_VISITOR_PER_DAY * 2, 86_400_000);
    const failed = (reason: string) => db.prepare("UPDATE pastes SET id = ?, result = ? WHERE id = ?").run(`failed-${randomBytes(6).toString("hex")}`, JSON.stringify({ failed: reason }), slot.id);

    const run = async () => {
      const src = new GitHubSource(repo, process.env.JR_GITHUB_PUBLIC_READ_TOKEN || undefined, "paste");
      const { files } = await traceFiles(src, parsed.frames);
      if (files.length === 0) {
        failed("no files");
        return c.json({ error: `None of the files in the traceback were found in ${repo}. Is the repository public, and is this its code?` }, 404);
      }
      // The repository is downloaded only once the traceback is known to belong to it.
      const [related, index] = await Promise.all([
        relatedFiles(src, files),
        process.env.JR_DIAGNOSIS_LOOKUPS !== "0" ? src.index().catch(() => null) : Promise.resolve(null),
      ]);
      for (const r of related) files.push({ ...r, related: true });

      const out = await runDiagnosis(ai, { exception_type: parsed.exception_type, message: parsed.message, transaction: null, frames: parsed.frames }, files, false, null, index);
      if ("error" in out) {
        failed("diagnosis");
        return c.json({ error: "The diagnosis did not finish. Try again in a minute." }, 502);
      }
      files.push(...out.files_read);

      // The same three-level gate as live incidents: recommended, use with care, or withheld.
      const gate = await runGate(ai, out.result, files);
      const fix: { status: "shown" | "rejected"; level: string | undefined; diff: string | null; reasons: string[] } = {
        status: gate.passed ? "shown" : "rejected",
        level: gate.level,
        diff: gate.passed ? gate.diff : null,
        reasons: gate.reasons,
      };

      const id = randomBytes(6).toString("hex");
      const result = {
        repo,
        exception: `${parsed.exception_type}: ${parsed.message}`,
        files: files.map((f) => f.path),
        cause_plain: out.result.cause_plain,
        cause_technical: out.result.cause_technical,
        file: out.result.file,
        line: out.result.line,
        confidence_words: out.result.confidence_words,
        test_hint: out.result.test_hint,
        fix,
      };
      db.prepare("UPDATE pastes SET id = ?, result = ? WHERE id = ?").run(id, JSON.stringify(result), slot.id);
      return c.json({ id, ...result });
    };
    try {
      // Spend for pastes is charged to its own daily budget (ai/claude.ts), never to Faurus's.
      return await spendContext.run({ projectId: 0, lane: "paste" }, run);
    } catch (e) {
      failed("error");
      throw e;
    }
  });

  app.get("/public/paste/:id", (c) => {
    // Failed and unfinished attempts are kept only to count against the quota; they are never shown.
    const row = db.prepare("SELECT result FROM pastes WHERE id = ? AND id NOT LIKE 'failed-%' AND id NOT LIKE 'pending-%'").get(c.req.param("id")) as { result: string } | undefined;
    return row ? c.json({ id: c.req.param("id"), ...JSON.parse(row.result) }) : c.json({ error: "not found" }, 404);
  });

  return app;
}
