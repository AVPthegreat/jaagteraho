// No-code connection: a host that can forward an app's logs (a "log drain") sends them to
// POST /logs/:projectId/:key. We pick out Python tracebacks and Node.js stack traces and treat
// each one like an error from the SDK. Everything else in the logs is dropped at once, never stored.
//
// Accepted bodies: plain text lines; JSON arrays or newline-delimited JSON with a `message` field
// (Vercel-style); Heroku-style logplex frames (application/logplex-1).

import { createHash } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { DB, Project } from "../db/db.js";
import { parseTraceback } from "../web/paste.js";
import type { CleanEvent } from "./allowlist.js";
import { clip } from "./mask.js";
import { storeEvent } from "./store.js";

const MAX_BODY_BYTES = 1024 * 1024;
const KEEP_LINES = 120;
const CARRY_MS = 30_000;
const MAX_STREAMS = 300; // with KEEP_LINES and MAX_LINE: at most about 70 MB held, however the drain is abused
const MAX_LINE = 2_000; // characters; a stack-trace line is far shorter

export type LogLine = { stream: string; text: string; path?: string | null };

/** Splits a drain body into log lines, each tagged with the stream it came from (so traces from parallel requests don't mix). */
export function extractLines(body: string, contentType = ""): LogLine[] {
  return extractRaw(body, contentType).map((l) => (l.text.length > MAX_LINE ? { ...l, text: l.text.slice(0, MAX_LINE) } : l));
}

function extractRaw(body: string, contentType = ""): LogLine[] {
  const out: LogLine[] = [];
  if (/logplex/i.test(contentType)) {
    // Frames: "<length> <syslog message>". Syslog: "<PRI>1 TIMESTAMP HOST APP PROCID MSGID MSG".
    let i = 0;
    while (i < body.length) {
      const m = /^(\d+) /.exec(body.slice(i, i + 12));
      if (!m) break;
      const len = Number(m[1]);
      const frame = body.slice(i + m[0].length, i + m[0].length + len);
      i += m[0].length + len;
      const s = /^<\d+>\d+ \S+ \S+ (\S+) (\S+) \S+ (.*)$/s.exec(frame.replace(/\n$/, ""));
      if (s) out.push({ stream: `${s[1]}/${s[2]}`, text: s[3] });
    }
    return out;
  }
  const trimmed = body.trimStart();
  if (trimmed.startsWith("[") || (trimmed.startsWith("{") && /json/i.test(contentType + trimmed.slice(0, 1)))) {
    let items: unknown[] = [];
    try {
      items = trimmed.startsWith("[") ? (JSON.parse(trimmed) as unknown[]) : trimmed.split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown);
    } catch {
      items = [];
    }
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const msg = [o.message, o.msg, o.log].find((v) => typeof v === "string") as string | undefined;
      if (!msg) continue;
      const proxy = o.proxy && typeof o.proxy === "object" ? (o.proxy as Record<string, unknown>) : {};
      const stream = String(o.requestId ?? o.request_id ?? o.deploymentId ?? o.source ?? "json");
      const path = typeof proxy.path === "string" ? proxy.path : typeof o.path === "string" ? o.path : null;
      for (const line of msg.split("\n")) out.push({ stream, text: line, path });
    }
    return out;
  }
  for (const raw of body.split("\n")) {
    // "2026-11-13T10:00:00Z app[web.1]: message" style prefixes keep their source as the stream.
    const m = /^\d{4}-\d\d-\d\dT\S+\s+([\w.-]+)(?:\[([\w.-]+)\])?:\s?(.*)$/.exec(raw);
    out.push(m ? { stream: `${m[1]}/${m[2] ?? ""}`, text: m[3] } : { stream: "text", text: raw });
  }
  return out;
}

const PY_START = /^\s*Traceback \(most recent call last\):\s*$/;
const PY_END = /^[A-Za-z_][\w.]*(Error|Exception|Exit|Interrupt|Warning|Fault)\b(:.*)?$/;
const JS_HEAD = /^\s*(?:Uncaught\s+)?(?:[A-Z]\w*(?:Error|Exception)|Error)(?: \[\w+\])?(?::.*)?$/;
const JS_AT = /^\s+at /;

// py: how many lines in `lines` start a Python traceback; atRun: how many trailing lines are "at ...".
// Both are kept up to date line by line, so each pushed line costs O(1) checks, not a rescan of the
// whole buffer (a 1 MB drain body of "ValueError" lines used to take about 0.6 s of CPU).
type Buffer_ = { lines: string[]; path: string | null; at: number; py: number; atRun: number };

const reset = (b: Buffer_) => {
  b.lines = [];
  b.py = 0;
  b.atRun = 0;
};

/** Finds complete stack traces in a stream of log lines. Keeps a little per-stream state between requests. */
export class TraceFinder {
  private streams = new Map<string, Buffer_>();

  push(key: string, lines: LogLine[], now = Date.now()): Array<{ text: string; path: string | null }> {
    const found: Array<{ text: string; path: string | null }> = [];
    for (const [k, b] of this.streams) if (now - b.at > CARRY_MS) this.streams.delete(k);
    for (const l of lines) {
      const id = `${key}|${l.stream}`;
      // Bounded memory: past MAX_STREAMS, the stream idle longest is forgotten (Maps keep insertion order).
      if (!this.streams.has(id) && this.streams.size >= MAX_STREAMS) this.streams.delete(this.streams.keys().next().value!);
      const b = this.streams.get(id) ?? { lines: [], path: null, at: now, py: 0, atRun: 0 };
      this.streams.delete(id);
      this.streams.set(id, b);
      b.at = now;
      if (l.path) b.path = l.path;
      const text = l.text.replace(/\r$/, "");
      const isAt = JS_AT.test(text);

      // A JavaScript stack ends at the first line that is not "at ...".
      if (!isAt) {
        const jsEnd = this.jsStack(b);
        if (jsEnd) {
          found.push({ text: jsEnd, path: b.path });
          reset(b);
        }
      }

      b.lines.push(text);
      b.atRun = isAt ? b.atRun + 1 : 0;
      if (PY_START.test(text)) b.py++;
      if (b.lines.length > KEEP_LINES) {
        for (const gone of b.lines.splice(0, b.lines.length - KEEP_LINES)) if (PY_START.test(gone)) b.py--;
        b.atRun = Math.min(b.atRun, b.lines.length);
      }

      if (b.py > 0 && !/^\s/.test(text) && PY_END.test(text.trim())) {
        // Chained exceptions ("During handling...") repeat the marker; take the whole chain from the first.
        const first = b.lines.findIndex((x) => PY_START.test(x));
        if (first >= 0) {
          found.push({ text: b.lines.slice(first).join("\n"), path: b.path });
          reset(b);
        }
      }
    }
    return found;
  }

  /** At the end of a request, a JavaScript stack whose last line was "at ..." is complete. */
  flush(key: string): Array<{ text: string; path: string | null }> {
    const found: Array<{ text: string; path: string | null }> = [];
    for (const [id, b] of this.streams) {
      if (!id.startsWith(`${key}|`)) continue;
      const js = this.jsStack(b);
      if (js) {
        found.push({ text: js, path: b.path });
        reset(b);
      }
    }
    return found;
  }

  /** The JavaScript stack the buffer ends with (a head line, then only "at ..." lines), or null. */
  private jsStack(b: Buffer_): string | null {
    if (b.atRun === 0) return null;
    const head = b.lines.length - 1 - b.atRun;
    return head >= 0 && JS_HEAD.test(b.lines[head]) ? b.lines.slice(head).join("\n") : null;
  }
}

export function toEvent(projectId: number, trace: { text: string; path: string | null }, at: Date): CleanEvent | null {
  const p = parseTraceback(trace.text);
  if (!p) return null;
  const minute = at.toISOString().slice(0, 16);
  const id = createHash("sha256").update(`${projectId}|${minute}|${trace.text}`).digest("hex").slice(0, 32);
  return {
    event_id: id, // the same trace delivered twice in one minute (drain retries) counts once
    timestamp: at.toISOString(),
    level: "error",
    platform: PY_START.test(trace.text.split("\n")[0] ?? "") || /Traceback \(most recent/.test(trace.text) ? "python" : "node",
    release: null,
    environment: null,
    transaction: trace.path ? clip(trace.path.split("?")[0], 200) : null,
    exception_type: p.exception_type,
    message: p.message,
    chain: [],
    frames: p.frames,
    tags: {},
    sdk: "jaagteraho.logs",
  };
}

export function logRoutes(db: DB, onStored?: (incidentId: number) => void) {
  const app = new Hono();
  const finder = new TraceFinder();
  const findProject = db.prepare("SELECT id, name, public_key, kind, rate_per_min FROM projects WHERE id = ?");
  const counts = new Map<number, { start: number; n: number }>();

  const check = (c: import("hono").Context) => {
    const project = findProject.get(Number(c.req.param("projectId"))) as Project | undefined;
    return project && c.req.param("key") === project.public_key ? project : null;
  };

  // Some hosts check the address with a GET before sending logs.
  app.get("/logs/:projectId/:key", (c) => {
    if (!check(c)) return c.json({ detail: "unknown project or key" }, 403);
    if (process.env.JR_VERCEL_VERIFY) c.header("x-vercel-verify", process.env.JR_VERCEL_VERIFY);
    return c.json({ ok: true });
  });

  // Enforced while reading, so a chunked upload without a Content-Length cannot exceed it either.
  app.use("/logs/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ detail: "too large" }, 413) }));

  app.post("/logs/:projectId/:key", async (c) => {
    const project = check(c);
    if (!project) return c.json({ detail: "unknown project or key" }, 403);
    if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) return c.json({ detail: "too large" }, 413);
    const body = await c.req.text();
    if (body.length > MAX_BODY_BYTES) return c.json({ detail: "too large" }, 413);
    const at = new Date();
    const key = String(project.id);
    const traces = [...finder.push(key, extractLines(body, c.req.header("content-type") ?? ""), at.getTime()), ...finder.flush(key)];
    let stored = 0;
    for (const t of traces) {
      const w = counts.get(project.id);
      if (!w || at.getTime() - w.start > 60_000) counts.set(project.id, { start: at.getTime(), n: 0 });
      const win = counts.get(project.id)!;
      if (++win.n > project.rate_per_min) break;
      const ev = toEvent(project.id, t, at);
      if (!ev) continue;
      const r = storeEvent(db, project.id, ev, at);
      if (r.stored) {
        stored++;
        onStored?.(r.incidentId);
      }
    }
    if (process.env.JR_VERCEL_VERIFY) c.header("x-vercel-verify", process.env.JR_VERCEL_VERIFY);
    return c.json({ ok: true, errors: stored });
  });
  return app;
}
