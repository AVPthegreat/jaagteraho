import type { Metadata } from "next";
import { Playground } from "./playground";
import "./playground.css";

export const metadata: Metadata = {
  title: "Live playground · JaagteRaho",
  description: "Pick a live app, plant a real bug, and watch JaagteRaho catch it, find the cause and fix it, live. You approve, or let it heal; undo any time.",
};

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
        <Playground />
        <p className="small soft pg2-foot">
          The playground never calls or messages anyone. Every run is real, with the same pipeline and limits as a connected app, on a separate daily
          budget.
        </p>
      </div>
    </section>
  );
}
