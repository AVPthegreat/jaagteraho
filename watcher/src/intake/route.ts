// POST /api/:projectId/envelope/ — the address a Sentry SDK sends errors to when its
// SENTRY_DSN points at JaagteRaho. Answers fast so the app never waits on us.

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import type { DB, Project } from "../db/db.js";
import { allowlistEvent } from "./allowlist.js";
import { parseEnvelope } from "./envelope.js";
import { storeEvent } from "./store.js";

const MAX_BODY_BYTES = 200 * 1024; // as sent (usually gzip)
const MAX_UNPACKED_BYTES = 1024 * 1024; // after decompression: stops zip bombs

export type IntakeOptions = { db: DB; now?: () => Date; onStored?: (incidentId: number) => void };

function sentryKey(authHeader: string | undefined, query: string | undefined): string | null {
  if (query) return query;
  const m = authHeader?.match(/sentry_key=([^,\s]+)/);
  return m ? m[1] : null;
}

function unpack(body: Buffer, encoding: string | undefined): Buffer {
  const opts = { maxOutputLength: MAX_UNPACKED_BYTES };
  switch ((encoding ?? "").toLowerCase()) {
    case "": case "identity": return body;
    case "gzip": return gunzipSync(body, opts);
    case "deflate": return inflateSync(body, opts);
    case "br": return brotliDecompressSync(body, opts);
    default: throw new Error(`unsupported encoding ${encoding}`);
  }
}

/**
 * True only when the request carries the app's server-only ingest secret: the X-JR-Ingest-Secret
 * header (Node: transportOptions.headers), or sentry_secret in X-Sentry-Auth (Python sends it when the
 * DSN is written https://KEY:SECRET@host/ID). The public key alone proves nothing: it ships in browsers.
 * Unauthenticated events still alert and get diagnosed; they can never make a fix apply itself.
 */
export function carriesSecret(secret: string | null | undefined, header: string | undefined, authHeader: string | undefined): boolean {
  if (!secret) return false;
  const given = header ?? authHeader?.match(/sentry_secret=([^,\s]+)/)?.[1];
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

class RateLimiter {
  private windows = new Map<number, { start: number; count: number }>();
  allow(projectId: number, perMinute: number, nowMs: number): boolean {
    const w = this.windows.get(projectId);
    if (!w || nowMs - w.start >= 60_000) {
      this.windows.set(projectId, { start: nowMs, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= perMinute;
  }
}

export function intakeRoutes({ db, now = () => new Date(), onStored }: IntakeOptions) {
  const app = new Hono();
  const limiter = new RateLimiter();
  const findProject = db.prepare("SELECT id, name, public_key, kind, rate_per_min, ingest_secret FROM projects WHERE id = ?");

  const handler = async (c: import("hono").Context) => {
    const projectId = Number(c.req.param("projectId"));
    const key = sentryKey(c.req.header("x-sentry-auth"), c.req.query("sentry_key"));
    const project = Number.isInteger(projectId) ? (findProject.get(projectId) as Project | undefined) : undefined;
    if (!project || !key || key !== project.public_key) return c.json({ detail: "unknown project or key" }, 403);
    const authenticated = carriesSecret((project as Project & { ingest_secret?: string | null }).ingest_secret, c.req.header("x-jr-ingest-secret"), c.req.header("x-sentry-auth"));

    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return c.json({ detail: "envelope too large" }, 413);
    const body = Buffer.from(await c.req.arrayBuffer());
    if (body.length > MAX_BODY_BYTES) return c.json({ detail: "envelope too large" }, 413);

    const at = now();
    let envelope;
    try {
      envelope = parseEnvelope(unpack(body, c.req.header("content-encoding")));
    } catch {
      return c.json({ detail: "could not read envelope" }, 400);
    }

    // We only use errors. Ask the SDK, in its own protocol, to stop sending everything else
    // (performance traces, sessions, replays) for an hour, so it never competes with errors.
    const types = new Set(envelope.items.map((i) => String(i.header.type)));
    const others = [...types].filter((t) => t !== "event");
    if (others.length) c.header("X-Sentry-Rate-Limits", `3600:${others.join(";")}:organization`);
    if (!types.has("event")) return c.json({ id: null });

    // Only error-carrying envelopes count toward the per-app limit.
    if (!limiter.allow(project.id, project.rate_per_min, at.getTime())) {
      c.header("Retry-After", "60");
      c.header("X-Sentry-Rate-Limits", "60:error:organization");
      return c.json({ detail: "rate limited" }, 429);
    }

    let eventId: string | null = null;
    for (const item of envelope.items) {
      // Only errors matter. Transactions, sessions, attachments and the rest are accepted and dropped.
      if (item.header.type !== "event") continue;
      let raw: unknown;
      try {
        raw = JSON.parse(item.payload.toString("utf8"));
      } catch {
        continue;
      }
      const clean = allowlistEvent(raw, at);
      if (!clean) continue;
      const result = storeEvent(db, project.id, clean, at, authenticated);
      eventId = clean.event_id;
      if (result.stored) onStored?.(result.incidentId);
    }
    return c.json({ id: eventId });
  };

  app.post("/api/:projectId/envelope/", handler);
  app.post("/api/:projectId/envelope", handler);
  return app;
}
