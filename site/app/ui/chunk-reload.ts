/*
  After a deploy, a page that was already open asks for old JavaScript chunks that no longer exist.
  That is not a real error: one hard reload fixes it. We reload at most once a minute (a
  sessionStorage stamp), so a truly broken page can never loop.
*/

const KEY = "jr_chunk_reload_at";

export const CHUNK_RE = /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isChunkError(e: unknown): boolean {
  if (!e) return false;
  const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
  const msg = typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return name === "ChunkLoadError" || CHUNK_RE.test(msg);
}

/** Reloads the page once; returns false if we already did so in the last minute. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No storage: still reload once per page load.
  }
  window.location.reload();
  return true;
}

/* The same guard as an inline script, run before the app's own JavaScript (see layout.tsx). */
export const CHUNK_GUARD_JS = `(function(){var K="${KEY}",R=${CHUNK_RE.toString()};function once(){try{var l=+sessionStorage.getItem(K)||0;if(Date.now()-l<60000)return;sessionStorage.setItem(K,String(Date.now()))}catch(e){}location.reload()}window.addEventListener("error",function(e){var t=e&&e.target;if(t&&t.tagName==="SCRIPT"&&/\\/_next\\//.test(t.src||"")){once();return}if(e&&e.message&&R.test(e.message))once()},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;if(r&&((r.name==="ChunkLoadError")||R.test(String(r.message||r))))once()})})();`;
