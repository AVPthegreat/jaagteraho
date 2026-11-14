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
            Live playground. <em>Break it, watch it heal.</em>
          </h1>
          <p className="lead">
            Seven live apps we built and run for this playground. Pick one, pick the bug to plant, and use the app: it really crashes. JaagteRaho
            catches it by itself, decides who to wake, finds the cause and writes a fix it proves with its own test. You approve it (or let it heal),
            our hidden test judges it, and the app works again. Undo it any time.
          </p>
        </div>
        <Playground />
        <p className="small soft pg-foot">
          The playground never calls or messages anyone. Every run is real, on your own copy of the app in an isolated sandbox with no network and
          no secrets, using the same pipeline and limits as a connected app and charged to a separate daily budget. When that budget is used up, the
          page says so and shows real past results.
        </p>
      </div>
    </section>
  );
}
