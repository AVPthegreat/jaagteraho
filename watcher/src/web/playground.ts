// Public API of the Live playground (playground/runner.ts): the list of live apps, attaching a visitor to
// one, its live feed, and the last finished runs for the home page's strip. The only visitor input that
// matters is the app's name, checked against the list; the session id only counts who is watching.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { Playground } from "../playground/runner.js";
import { playgroundBus, type PlaygroundEvent } from "../playground/events.js";
import { Slots, Window } from "./limits.js";
import { clientIp, FEEDS_MAX, FEEDS_PER_IP } from "./public.js";

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;

export function playgroundRoutes(pg: Playground, allowedOrigins: string[]) {
  const app = new Hono();
  const limits = new Window();
  const feeds = new Slots(FEEDS_PER_IP, FEEDS_MAX);
  app.use("/public/playground/*", cors({ origin: allowedOrigins, allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"], maxAge: 600 }));

  const reads = (c: Parameters<typeof clientIp>[0]) => limits.allowAll([[`pr:${clientIp(c)}`, 240, 60_000], ["pr:global", 20_000, 60_000]]);

  app.get("/public/playground/apps", (c) => {
    if (!reads(c)) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    const cases = pg.bench.cases.filter((x) => x.kind === "bug");
    return c.json({
      apps: pg.apps.map((a) => ({
        ...a,
        bugs: cases.filter((x) => x.app === a.name).length,
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
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { session?: unknown; app?: unknown };
    const session = typeof body.session === "string" ? body.session : "";
    if (!SESSION.test(session) || !pg.hasApp(body.app)) return c.json({ error: "Choose one of the live apps." }, 400);
    const ip = clientIp(c);
    // The address is checked first (fresh sessions are free to make); a hit counts only when all limits allow it.
    if (!limits.peek(`wip:${ip}`, 120, 3_600_000)) return c.json({ error: "Easy there. Try again in a while." }, 429);
    if (!limits.allowAll([[`wip:${ip}`, 120, 3_600_000], [`w:${session}`, 20, 60_000], ["w:global", 6_000, 3_600_000]])) return c.json({ error: "Easy there. Try again in a minute." }, 429);
    pg.watch(session, body.app);
    const started = pg.startNow(body.app, Date.now(), true);
    return c.json({ ok: true, started, ...pg.snapshot(body.app) });
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
