"use client";

import Link from "next/link";
import { useEffect } from "react";
import { isChunkError, reloadOnce } from "../ui/chunk-reload";
import "./playground.css";

/* If anything on the playground page breaks, the visitor gets this, in our design, never the framework's error screen. */
export default function PlaygroundError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Old chunks after a deploy: one quiet reload fixes it.
    if (isChunkError(error)) reloadOnce();
  }, [error]);
  return (
    <section className="section pg-page" aria-labelledby="pg-err-h">
      <div className="frame">
        <div className="pg-error">
          <p className="eyebrow">Live playground</p>
          <h1 id="pg-err-h" className="h-section">
            We lost the live connection. <em>The watchman is still awake.</em>
          </h1>
          <p className="lead">The live server may be restarting. Your bug and its fix are kept on the server for 30 minutes, so you can pick up where you were.</p>
          <p className="actions">
            <button type="button" className="btn btn-lg" onClick={() => reset()}>
              Reconnect <span className="arrow" aria-hidden="true">→</span>
            </button>
            <Link className="btn btn-ghost btn-lg" href="/">
              Back to the home page
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
