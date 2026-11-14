import type { Metadata } from "next";
import { PlaygroundBoundary } from "./boundary";
import { Playground } from "./playground";
import { TITLES } from "./play";
import "./playground.css";

const DESCRIPTION = "Pick a live app, plant a real bug, and watch JaagteRaho catch it, find the cause and fix it, live. You approve, or let it heal; undo any time.";

/* A shared link (?app=…) gets a share image naming that app; only known app names are used. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ app?: string }> }): Promise<Metadata> {
  const { app } = await searchParams;
  const known = typeof app === "string" && app in TITLES ? app : null;
  const title = known ? `Watch JaagteRaho fix a real bug in ${TITLES[known]} · JaagteRaho` : "Live playground · JaagteRaho";
  return {
    title,
    description: DESCRIPTION,
    openGraph: { title, description: DESCRIPTION, images: [{ url: `/playground/og${known ? `?app=${known}` : ""}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [`/playground/og${known ? `?app=${known}` : ""}`] },
  };
}

export default function PlaygroundPage() {
  return (
    <section className="section pg2-page" aria-labelledby="pg-h">
      <div className="frame">
        <header className="pg2-head">
          <p className="eyebrow live">
            <i aria-hidden="true" /> Live · no sign-up
          </p>
          <h1 id="pg-h" className="h-section">
            Plant a bug. <em>Watch it heal.</em>
          </h1>
          <p className="pg2-lead">Real apps, real crashes, a real fix. Your own copy, in an isolated sandbox.</p>
        </header>
        <PlaygroundBoundary>
          <Playground />
        </PlaygroundBoundary>
        <p className="small soft pg2-foot">
          The playground never calls or messages anyone. Every run is real, with the same pipeline and limits as a connected app, on a separate daily
          budget.
        </p>
      </div>
    </section>
  );
}
