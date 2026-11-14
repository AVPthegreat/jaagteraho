import type { Metadata } from "next";
import { Playground } from "./playground";
import "./playground.css";

export const metadata: Metadata = {
  title: "Live playground · JaagteRaho",
  description:
    "Pick a live app. A real bug is planted in its code every minute, the app really crashes, and JaagteRaho decides, finds the cause, writes a fix and proves it with a hidden test, live.",
};

export default function PlaygroundPage() {
  return (
    <section className="section pg-page" aria-labelledby="pg-h">
      <div className="frame">
        <div className="section-head">
          <p className="eyebrow live">
            <i aria-hidden="true" /> Live · no sign-up
          </p>
          <h1 id="pg-h" className="h-section">
            Live playground. <em>A real bug every minute.</em>
          </h1>
          <p className="lead">
            Seven live apps we built and run for this playground. Pick one: we plant a real bug in its code, it really crashes, and JaagteRaho takes
            over. It decides who to wake, finds the cause, writes a fix and proves it, and then our hidden test, which it never sees, judges the fix. You
            do nothing.
          </p>
        </div>
        <Playground />
        <p className="small soft pg-foot">
          The playground never calls or messages anyone. Each run uses the same pipeline and limits as a connected app, charged to a separate daily
          budget; when that budget is used up, the page replays the last real runs and says so.
        </p>
      </div>
    </section>
  );
}
