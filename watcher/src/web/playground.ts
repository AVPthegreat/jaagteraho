// Public API of the Live playground (playground/runner.ts): the list of live apps, attaching a visitor to
// one, its live feed, and the last finished runs for the home page's strip. The only visitor input that
// matters is the app's name, checked against the list; the session id only counts who is watching.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { Playground } from "../playground/runner.js";
import { playgroundBus, type PlaygroundEvent } from "../playground/events.js";
import { liveFeeds, netKey, Window } from "./limits.js";
import { clientIp } from "./public.js";

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;

export function playgroundRoutes(pg: Playground, allowedOrigins: string[]) {
  const app = new Hono();
  const limits = new Window();
  const feeds = liveFeeds;
  app.use("/public/playground/*", cors({ origin: allowedOrigins, allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"], maxAge: 600 }));

  const reads = (c: Parameters<typeof clientIp>[0]) => limits.allowAll([[`pr:${clientIp(c)}`, 240, 60_000], ["pr:global", 20_000, 60_000]]);

  app.get("/public/playground/apps", (c) => {
    if (!reads(c)) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    const cases = pg.bench.cases.filter((x) => x.kind === "bug");
    return c.json({
      apps: pg.apps.map((a) => ({
        ...a,
        bugs: cases.filter((x) => x.app === a.name).length,
        cases: pg.caseList(a.name),
        watching: pg.watching(a.name),
        running: pg.isRunning(a.name),
      })),
      every_seconds: Math.round(pg.snapshot(pg.apps[0]?.name ?? "").every_seconds),
      live: pg.canSpend(),
      stats: pg.stats(),
    });
  });

  app.get("/public/playground/latest", (c) => {
    if (!reads(c)) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    const n = Math.min(20, Math.max(1, Number(c.req.query("n")) || 8));
    return c.json({ runs: pg.latest(n), stats: pg.stats(), live: pg.canSpend() });
  });

  app.post("/public/playground/watch", async (c) => {
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: unknown; app?: unknown; open?: unknown };
    const session = typeof body.session === "string" ? body.session : "";
    if (!SESSION.test(session) || !pg.hasApp(body.app)) return c.json({ error: "Choose one of the live apps." }, 400);
    const ip = clientIp(c);
    // The address is checked first (fresh sessions are free to make); a hit counts only when all limits allow it.
    if (!limits.peek(`wip:${ip}`, 120, 3_600_000)) return c.json({ error: "Easy there. Try again in a while." }, 429);
    if (!limits.allowAll([[`wip:${ip}`, 120, 3_600_000], [`w:${session}`, 20, 60_000], ["w:global", 6_000, 3_600_000]])) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    pg.watch(session, body.app);
    // "open": the visitor just opened this app, so a run starts at once if none is in flight. Heartbeats
    // (open false) only keep the visitor counted; the ticker then plants a bug every minute.
    const started = body.open === true ? pg.startNow(body.app, Date.now(), true) : null;
    return c.json({ ok: true, started, ...pg.snapshot(body.app) });
  });

  // ---- a visitor's own run: plant the bug they picked, use the app, approve or undo the fix ----------

  const ownLimits = (c: Parameters<typeof clientIp>[0], kind: string, session: string, perSession: number, perIp: number) =>
    limits.allowAll([[`${kind}ip:${clientIp(c)}`, perIp, 3_600_000], [`${kind}:${session}`, perSession, 60_000], [`${kind}:global`, perIp * 50, 3_600_000]]);
  const readBody = async (c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const NOT_YOURS = { error: "This run is not yours, or it has expired. Plant a new bug." };

  app.post("/public/playground/run", async (c) => {
    const body = await readBody(c);
    const session = typeof body.session === "string" ? body.session : "";
    if (!SESSION.test(session) || !pg.hasApp(body.app) || typeof body.case !== "string") return c.json({ error: "Choose one of the live apps and one of its bugs." }, 400);
    if (body.heal !== undefined && body.heal !== "ask" && body.heal !== "auto") return c.json({ error: "Choose a heal rule." }, 400);
    // Each run spends from the playground's daily budget, so one address (and one network) gets only a few an hour.
    const ip = clientIp(c);
    if (!limits.allowAll([[`runip:${ip}`, 5, 3_600_000], [`runnet:${netKey(ip)}`, 15, 3_600_000], [`run:${session}`, 4, 60_000], ["run:global", 600, 3_600_000]]))
      return c.json({ error: "You have planted a lot of bugs from here this hour. Try again later, or watch the last real runs." }, 429);
    const r = pg.startOwn({ session, caseId: body.case, exam: body.exam === true, heal: body.heal === "auto" ? "auto" : "ask" }, body.app);
    if ("error" in r) {
      const said: Record<string, [string, 400 | 409 | 503]> = {
        app: ["Choose one of the live apps.", 400],
        case: ["Choose one of this app's bugs.", 400],
        busy: ["Your last bug is still being handled. Watch it finish first.", 409],
        full: ["Three bugs are being handled right now. Try again in a few seconds.", 503],
        cap: ["Today's live budget for the playground is used up. The replays of real runs keep playing.", 503],
      };
      const [msg, code] = said[r.error];
      return c.json({ error: msg, reason: r.error }, code);
    }
    return c.json({ ok: true, ...r });
  });

  const ownAction = (kind: "use" | "approve" | "undo", perSession: number, perIp: number) =>
    app.post(`/public/playground/${kind}`, async (c) => {
      const body = await readBody(c);
      const session = typeof body.session === "string" ? body.session : "";
      if (!SESSION.test(session) || !Number.isInteger(body.run_id)) return c.json({ error: "bad request" }, 400);
      if (!ownLimits(c, kind, session, perSession, perIp)) return c.json({ error: "Easy there. Try again in a minute." }, 429);
      const o = pg.ownRun(session, body.run_id as number);
      if (!o) return c.json(NOT_YOURS, 403);
      if (o.state === "running") return c.json({ error: "JaagteRaho is still working on this bug." }, 409);
      if (kind === "use") {
        try {
          const used = await pg.use(o);
          if (used === "busy") return c.json({ error: "The app is busy with another request. Try again in a moment." }, 429);
          return c.json({ ok: true, ...used });
        } catch (e) {
          console.error("playground use:", String(e));
          return c.json({ error: "The app could not be reached just now. Try again." }, 502);
        }
      }
      if (kind === "approve") {
        if (!o.approvable) return c.json({ error: "This fix cannot be applied." }, 409);
        return (await pg.applyFix(o, "approved")) === "applied" ? c.json({ ok: true }) : c.json({ error: "The fix is already applied." }, 409);
      }
      return pg.undo(o) ? c.json({ ok: true }) : c.json({ error: "There is no applied fix to undo." }, 409);
    });
  ownAction("use", 20, 300);
  ownAction("approve", 10, 120);
  ownAction("undo", 10, 120);

  // The session id is the visitor's credential, so it never goes in a URL: the page POSTs it for a one-time
  // ticket (60 s, single use) and opens the live feed with the ticket.
  app.post("/public/playground/mine", async (c) => {
    const body = await readBody(c);
    const session = typeof body.session === "string" ? body.session : "";
    if (!SESSION.test(session)) return c.json({ error: "bad session" }, 400);
    if (!ownLimits(c, "ticket", session, 30, 600)) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    return c.json({ ticket: pg.feedTicket(session) });
  });

  // The visitor's own runs: a snapshot of the current one first (so a reconnecting page resumes), then every step.
  app.get("/public/playground/mine/:ticket", (c) => {
    const session = pg.redeemTicket(c.req.param("ticket"));
    if (!session) return c.json({ error: "This live view has expired. Reconnecting." }, 401);
    const ip = clientIp(c);
    if (!feeds.take(ip)) return c.json({ error: "Too many live views are open. Close a tab and try again." }, 429);
    let released = false;
    const release = () => {
      if (!released) feeds.release(ip);
      released = true;
    };
    return streamSSE(
      c,
      async (stream) => {
        const queue: PlaygroundEvent[] = [];
        let wake: (() => void) | null = null;
        const onEvent = (ev: PlaygroundEvent) => {
          queue.push(ev);
          wake?.();
        };
        playgroundBus.on(`session:${session}`, onEvent);
        stream.onAbort(() => {
          playgroundBus.off(`session:${session}`, onEvent);
          release();
          wake?.();
        });
        await stream.writeSSE({ event: "snapshot", data: JSON.stringify({ run: pg.ownSnapshot(session) }) });
        const until = Date.now() + 30 * 60_000;
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
          await stream.writeSSE({ event: "step", data: JSON.stringify(ev) });
        }
        playgroundBus.off(`session:${session}`, onEvent);
        release();
      },
      async (err) => {
        console.error("playground mine:", err);
        release();
      },
    );
  });

  // Live feed of one app: a snapshot first (the run so far, the last result, the next bug's time), then every step.
  app.get("/public/playground/feed/:app", (c) => {
    const name = c.req.param("app");
    if (!pg.hasApp(name)) return c.json({ error: "unknown app" }, 400);
    const ip = clientIp(c);
    if (!feeds.take(ip)) return c.json({ error: "Too many live views are open. Close a tab and try again." }, 429);
    let released = false;
    const release = () => {
      if (!released) {
        feeds.release(ip);
        pg.feedClosed(name);
      }
      released = true;
    };
    pg.feedOpened(name);
    return streamSSE(
      c,
      async (stream) => {
        const queue: PlaygroundEvent[] = [];
        let wake: (() => void) | null = null;
        const onEvent = (ev: PlaygroundEvent) => {
          queue.push(ev);
          wake?.();
        };
        playgroundBus.on(`app:${name}`, onEvent);
        stream.onAbort(() => {
          playgroundBus.off(`app:${name}`, onEvent);
          release();
          wake?.();
        });
        await stream.writeSSE({ event: "snapshot", data: JSON.stringify(pg.snapshot(name)) });
        const until = Date.now() + 30 * 60_000;
        while (!stream.aborted && Date.now() < until) {
          if (queue.length === 0) {
            await new Promise<void>((r) => {
              wake = r;
              setTimeout(r, 15_000);
            });
            wake = null;
          }
          if (queue.length === 0) {
            await stream.writeSSE({ event: "ping", data: JSON.stringify({ next_at: pg.snapshot(name).next_at }) });
            continue;
          }
          const ev = queue.shift()!;
          await stream.writeSSE({ event: "step", data: JSON.stringify(ev) });
        }
        playgroundBus.off(`app:${name}`, onEvent);
        release();
      },
      async (err) => {
        console.error("playground feed:", err);
        release();
      },
    );
  });

  // Every app's finished runs, for the home page's live strip (only the "done" step, which carries the scorecard).
  app.get("/public/playground/stream", (c) => {
    const ip = clientIp(c);
    if (!feeds.take(ip)) return c.json({ error: "Too many live views are open. Close a tab and try again." }, 429);
    let released = false;
    const release = () => {
      if (!released) feeds.release(ip);
      released = true;
    };
    return streamSSE(
      c,
      async (stream) => {
        const queue: PlaygroundEvent[] = [];
        let wake: (() => void) | null = null;
        const onEvent = (ev: PlaygroundEvent) => {
          if (ev.step !== "done" && ev.step !== "plant") return;
          queue.push(ev);
          wake?.();
        };
        playgroundBus.on("all", onEvent);
        stream.onAbort(() => {
          playgroundBus.off("all", onEvent);
          release();
          wake?.();
        });
        const until = Date.now() + 30 * 60_000;
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
          await stream.writeSSE({ event: ev.step, data: JSON.stringify(ev) });
        }
        playgroundBus.off("all", onEvent);
        release();
      },
      async (err) => {
        console.error("playground stream:", err);
        release();
      },
    );
  });

  return app;
}
