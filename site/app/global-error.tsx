"use client";

import { useEffect } from "react";
import { isChunkError, reloadOnce } from "./ui/chunk-reload";

/*
  The last line of defence (an error in the root layout itself). It replaces the whole page, so it
  brings its own minimal styles. Old chunks after a deploy reload once instead of showing this.
*/
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isChunkError(error)) reloadOnce();
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#06080d", color: "#eef1f7", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 520, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontWeight: 500, fontSize: "1.8rem", margin: "0 0 12px" }}>JaagteRaho blinked for a moment.</h1>
          <p style={{ color: "#a6aec0", margin: "0 0 24px" }}>Usually the live server is restarting. Try again in a few seconds.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ background: "#7aa7ff", color: "#061433", border: 0, borderRadius: 10, padding: "12px 20px", fontWeight: 600, cursor: "pointer", marginRight: 8 }}
          >
            Try again
          </button>
          <a href="/" style={{ color: "#eef1f7" }}>
            Back to home
          </a>
        </main>
      </body>
    </html>
  );
}
