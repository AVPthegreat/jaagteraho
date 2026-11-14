"use client";

import Link from "next/link";
import { useEffect } from "react";

/* Any page that throws shows this, in the site's design, with a way to retry. */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.warn("page error", error?.digest ?? error?.message);
  }, [error]);
  return (
    <section className="section" aria-labelledby="err-h">
      <div className="frame">
        <div className="section-head">
          <h1 id="err-h" className="h-section">
            Something went wrong on this page. <em>Let&apos;s try that again.</em>
          </h1>
          <p className="lead">It is usually a moment&apos;s blip while the live server restarts.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-lg" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn btn-ghost btn-lg" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
