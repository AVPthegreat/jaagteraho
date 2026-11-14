// Public, read-mostly API for the website: break a sandbox flow, follow your run live,
// approve the fix for your own session, sign the logbook, and read measured numbers.
// Faurus's own failure counts are never exposed here.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { bus, type FeedEvent } from "../bus.js";
import type { DB } from "../db/db.js";
import type { Voice } from "../voice/voice.js";

const FLOWS = { submit: "/api/submit", exam: "/api/exam/start", pay: "/api/pay" } as const;
type Flow = keyof typeof FLOWS;
const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const COUNTRY = /^[A-Z]{2}$/;

export type PublicOptions = {
  db: DB;
  voice: Voice | null;
  twinBroken: string; // e.g. http://127.0.0.1:8001
  twinFixed: string; // e.g. http://127.0.0.1:8002
  allowedOrigins: string[];
};

/** The caller's address as Caddy reports it (first X-Forwarded-For entry). Used only for limits, never stored. */
/**
 * The visitor's address as our own proxy (Caddy) saw it: the LAST X-Forwarded-For entry. Earlier
 * entries come from the client and can be forged, so they are never trusted.
 */
export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (c.req.header("x-forwarded-for") ?? "").split(",").pop()!.trim() || "direct";
}

export class Window {
  private hits = new Map<string, number[]>();
  allow(key: string, max: number, ms: number): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < ms);
    if (list.length >= max) return false;
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}

export function publicRoutes({ db, voice, twinBroken, twinFixed, allowedOrigins }: PublicOptions) {
  const app = new Hono();
  const limits = new Window();
  app.use("/public/*", cors({ origin: allowedOrigins, allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"], maxAge: 600 }));

  const touchVisitor = (session: string, country: string | null) =>
    db
      .prepare(
        `INSERT INTO visitors (session_id, first_seen, country) VALUES (?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET country = COALESCE(visitors.country, excluded.country)`,
      )
      .run(session, new Date().toISOString(), country);

  // Records seconds from the press to each step of this visitor's run.
  function track(visitId: number, session: string) {
    const started = Date.now();
    const seconds = () => Math.round((Date.now() - started) / 100) / 10;
    const handler = (ev: FeedEvent) => {
      if (ev.type === "decision") {
        db.prepare("UPDATE visits SET incident_id = ?, action = ?, t_alert = COALESCE(t_alert, ?) WHERE id = ?").run(ev.incident_id, String(ev.data.action), seconds(), visitId);
      } else if (ev.type === "cause" && !ev.data.unavailable) {
        db.prepare("UPDATE visits SET t_cause = COALESCE(t_cause, ?) WHERE id = ?").run(seconds(), visitId);
      } else if (ev.type === "fix") {
        db.prepare("UPDATE visits SET t_fix = COALESCE(t_fix, ?) WHERE id = ?").run(seconds(), visitId);
        bus.off(`session:${session}`, handler);
      }
    };
    bus.on(`session:${session}`, handler);
    setTimeout(() => bus.off(`session:${session}`, handler), 5 * 60_000).unref();
  }

  app.post("/public/break", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: string; flow?: string; exam?: boolean; country?: string };
    const session = typeof body.session === "string" ? body.session : "";
    const flow = body.flow as Flow;
    if (!SESSION.test(session) || !(typeof flow === "string" && Object.hasOwn(FLOWS, flow))) return c.json({ error: "Choose a flow to break." }, 400);
    if (!limits.allow(`s:${session}`, 6, 60_000)) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    // Fresh sessions are free to make, so the network address is limited too.
    if (!limits.allow(`ip:${clientIp(c)}`, 30, 3_600_000)) return c.json({ error: "Easy there. Try again in a while." }, 429);
    if (!limits.allow("global", 240, 3_600_000)) return c.json({ error: "The demo is busy. Try again in a few minutes." }, 429);
    const country = typeof body.country === "string" && COUNTRY.test(body.country) ? body.country : null;
    touchVisitor(session, country);

    const fixed = db.prepare("SELECT fix_id FROM session_fixes WHERE session_id = ? AND flow = ?").get(session, flow) as { fix_id: number } | undefined;
    const build = fixed ? "fixed" : "broken";
    const visitId = Number(
      db.prepare("INSERT INTO visits (session_id, flow, exam_on, build, started_at) VALUES (?, ?, ?, ?, ?)").run(session, flow, body.exam ? 1 : 0, build, new Date().toISOString()).lastInsertRowid,
    );
    if (build === "broken") track(visitId, session);

    let status = 0;
    let result: unknown = null;
    try {
      const res = await fetch(`${build === "fixed" ? twinFixed : twinBroken}${FLOWS[flow]}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-jr-session": session, "x-jr-exam": body.exam ? "on" : "off" },
        body: "{}",
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      result = await res.json().catch(() => null);
    } catch {
      return c.json({ error: "The demo portal did not answer. Try again." }, 502);
    }
    if (build === "fixed") {
      const ok = status < 500;
      db.prepare("UPDATE visits SET fixed_ok = ? WHERE id = ?").run(ok ? 1 : 0, visitId);
      if (ok) bus.publish(session, { type: "fixed", at: new Date().toISOString(), incident_id: 0, data: { flow, result } });
    }
    return c.json({ build, status, result });
  });

  app.get("/public/feed/:session", (c) => {
    const session = c.req.param("session");
    if (!SESSION.test(session)) return c.json({ error: "bad session" }, 400);
    return streamSSE(c, async (stream) => {
      const queue: FeedEvent[] = [];
      let wake: (() => void) | null = null;
      const onEvent = (ev: FeedEvent) => {
        queue.push(ev);
        wake?.();
      };
      bus.on(`session:${session}`, onEvent);
      stream.onAbort(() => {
        bus.off(`session:${session}`, onEvent);
      });
      const until = Date.now() + 10 * 60_000;
      while (!stream.aborted && Date.now() < until) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            wake = r;
            setTimeout(r, 15_000);
          });
          wake = null;
        }
        if (queue.length === 0) {
          await stream.writeSSE({ event: "ping", data: "{}" });
          continue;
        }
        const ev = queue.shift()!;
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
      bus.off(`session:${session}`, onEvent);
    });
  });

  // A visitor's Approve switches only their own session to the fixed build.
  app.post("/public/approve", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: string; flow?: string; fix_id?: number };
    const flow = body.flow as Flow;
    if (!SESSION.test(body.session ?? "") || !(typeof flow === "string" && Object.hasOwn(FLOWS, flow)) || !Number.isInteger(body.fix_id)) return c.json({ error: "bad request" }, 400);
    const fix = db
      .prepare(
        `SELECT f.status, f.gate_result, i.transaction_name FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id JOIN incidents i ON i.id = d.incident_id
         JOIN projects p ON p.id = i.project_id WHERE f.id = ? AND p.kind = 'sandbox'`,
      )
      .get(body.fix_id) as { status: string; gate_result: string; transaction_name: string | null } | undefined;
    const caution = fix ? (JSON.parse(fix.gate_result) as { level?: string }).level === "caution" : false;
    if (!fix || fix.status === "rejected" || caution || fix.transaction_name !== FLOWS[flow]) return c.json({ error: "This fix cannot be approved." }, 409);
    db.prepare("INSERT OR REPLACE INTO session_fixes (session_id, flow, fix_id, at) VALUES (?, ?, ?, ?)").run(body.session, flow, body.fix_id, new Date().toISOString());
    return c.json({ ok: true });
  });

  app.post("/public/sign", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: string; name?: string; country?: string; live_app?: boolean };
    if (!SESSION.test(body.session ?? "")) return c.json({ error: "bad session" }, 400);
    const name = (typeof body.name === "string" ? body.name : "").replace(/[<>]/g, "").trim().slice(0, 40);
    const country = (typeof body.country === "string" ? body.country : "").replace(/[<>]/g, "").trim().slice(0, 40);
    if (!name || !country) return c.json({ error: "Add a name or handle and a country." }, 400);
    touchVisitor(body.session!, null);
    db.prepare("UPDATE visitors SET name_or_handle = ?, country = ?, runs_live_app = ?, signed_at = ? WHERE session_id = ?").run(
      name, country, body.live_app ? 1 : 0, new Date().toISOString(), body.session,
    );
    return c.json({ ok: true });
  });

  app.get("/public/evidence", (c) => {
    const median = (col: string) => {
      const rows = db.prepare(`SELECT ${col} AS v FROM visits WHERE ${col} IS NOT NULL ORDER BY ${col}`).all() as Array<{ v: number }>;
      if (rows.length === 0) return null;
      const m = Math.floor(rows.length / 2);
      return rows.length % 2 ? rows[m].v : Math.round(((rows[m - 1].v + rows[m].v) / 2) * 10) / 10;
    };
    const runs = (db.prepare("SELECT COUNT(*) AS n FROM visits WHERE build = 'broken'").get() as { n: number }).n;
    const people = (db.prepare("SELECT COUNT(*) AS n FROM visitors").get() as { n: number }).n;
    const signed = db.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT country) AS c, SUM(runs_live_app) AS live FROM visitors WHERE signed_at IS NOT NULL").get() as { n: number; c: number; live: number | null };
    const countries = db
      .prepare("SELECT country, COUNT(*) AS n FROM visitors WHERE country IS NOT NULL GROUP BY country HAVING n >= 1 ORDER BY n DESC")
      .all() as Array<{ country: string; n: number }>;
    const verdicts = db.prepare("SELECT owner_verdict AS v, COUNT(*) AS n FROM diagnoses WHERE replayed_from IS NULL AND owner_verdict != 'none' GROUP BY owner_verdict").all() as Array<{ v: string; n: number }>;
    const decisions = db.prepare("SELECT action, COUNT(*) AS n FROM visits WHERE action IS NOT NULL GROUP BY action").all() as Array<{ action: string; n: number }>;
    const cost = db.prepare("SELECT COALESCE(AVG(cost_usd), 0) AS avg FROM diagnoses WHERE replayed_from IS NULL AND cost_usd > 0").get() as { avg: number };
    // JaagteRaho watches its own code too; these counts are about itself, not about any user's app.
    const self = db
      .prepare(
        `SELECT COUNT(DISTINCT i.id) AS incidents,
                COUNT(DISTINCT CASE WHEN f.status IN ('shown', 'approved', 'merged') THEN f.diagnosis_id END) AS fixes_proposed,
                COUNT(DISTINCT CASE WHEN f.status IN ('approved', 'merged') THEN f.diagnosis_id END) AS fixes_applied
         FROM incidents i JOIN projects p ON p.id = i.project_id
         LEFT JOIN diagnoses d ON d.incident_id = i.id AND d.replayed_from IS NULL LEFT JOIN fixes f ON f.diagnosis_id = d.id
         WHERE p.name = 'jaagteraho'`,
      )
      .get() as { incidents: number; fixes_proposed: number; fixes_applied: number };
    return c.json({
      runs,
      people,
      signed: signed.n,
      signed_countries: signed.c,
      signed_live_app: signed.live ?? 0,
      countries,
      median_seconds: { alert: median("t_alert"), cause: median("t_cause"), fix: median("t_fix") },
      decisions: Object.fromEntries(decisions.map((d) => [d.action, d.n])),
      owner_marked: Object.fromEntries(verdicts.map((v) => [v.v, v.n])),
      avg_diagnosis_cost_usd: Math.round(cost.avg * 10000) / 10000,
      watching_itself: self,
    });
  });

  app.get("/public/voice/:id", async (c) => {
    const format = c.req.query("format") === "mp3" ? "mp3" : "ogg";
    const audio = await voice?.get(c.req.param("id"), format);
    if (!audio) return c.json({ error: "not found" }, 404);
    return c.body(new Uint8Array(audio), 200, { "content-type": format === "mp3" ? "audio/mpeg" : "audio/ogg", "cache-control": "public, max-age=86400" });
  });

  return app;
}
