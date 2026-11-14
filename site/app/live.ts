/*
  Talking to the live server (the watcher) without ever crashing the page. The watcher restarts on
  deploys and the network drops on phones, so every read here can fail: fetches return null instead
  of throwing, bad or partial JSON is dropped, and live feeds reconnect by themselves with backoff.
*/

export type LiveState = "connecting" | "open" | "down";

/** JSON.parse that returns null on anything that is not valid JSON. */
export function safeParse<T = unknown>(s: unknown): T | null {
  if (typeof s !== "string" || s === "") return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** GET (or any request) returning parsed JSON, or null on a network error, a timeout, a non-2xx or bad JSON. */
export async function getJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return safeParse<T>(await res.text());
  } catch {
    return null;
  }
}

/** The delay before retry number `n` (0-based): 1 s, 2 s, 4 s ... up to 30 s, with jitter. */
export function backoff(n: number): number {
  return Math.min(30_000, 1000 * 2 ** n) * (0.75 + Math.random() * 0.5);
}

/**
 * Calls `load` until it returns something other than null, waiting longer between tries.
 * `onFail` is told about each failure (to show "reconnecting"). Returns a cancel function.
 */
export function retry<T>(load: () => Promise<T | null>, onOk: (v: T) => void, onFail?: (tries: number) => void): () => void {
  let dead = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let n = 0;
  const go = async () => {
    const v = await load().catch(() => null);
    if (dead) return;
    if (v !== null) return onOk(v);
    onFail?.(++n);
    timer = setTimeout(go, backoff(n - 1));
  };
  void go();
  return () => {
    dead = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * A Server-Sent Events feed that survives the server going away. The browser retries a dropped
 * connection by itself, but gives up for good when the server answers with an error status (as a
 * proxy does while the watcher restarts); then we open a fresh one with backoff. Each handler gets
 * parsed JSON; events with no data or bad JSON are skipped, and a handler that throws is contained.
 */
export function liveFeed(
  url: string,
  handlers: Record<string, (data: unknown) => void>,
  onState?: (s: LiveState) => void,
): () => void {
  let es: EventSource | null = null;
  let dead = false;
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (dead) return;
    onState?.(tries === 0 ? "connecting" : "down");
    try {
      es = new EventSource(url);
    } catch {
      return later();
    }
    es.onopen = () => {
      tries = 0;
      onState?.("open");
    };
    es.onerror = (e) => {
      // A server event named "error" (the demo feed has one) also lands here; it is data, not a dropped connection.
      if (e instanceof MessageEvent && typeof e.data === "string" && e.data !== "") return;
      if (dead || !es) return;
      onState?.("down");
      if (es.readyState === EventSource.CLOSED) later();
    };
    for (const [name, fn] of Object.entries(handlers)) {
      es.addEventListener(name, (m) => {
        const data = safeParse((m as MessageEvent).data);
        if (data === null || typeof data !== "object") return;
        try {
          fn(data);
        } catch (e) {
          console.warn(`live feed: dropped a "${name}" event`, e);
        }
      });
    }
  };
  const later = () => {
    es?.close();
    es = null;
    if (dead) return;
    timer = setTimeout(open, backoff(tries++));
  };

  open();
  return () => {
    dead = true;
    if (timer) clearTimeout(timer);
    es?.close();
  };
}

/** Plain-object check for data coming off the wire. */
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
