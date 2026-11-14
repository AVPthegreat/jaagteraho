import Link from "next/link";
import { Clips } from "./home/clips";
import { HomeMotion } from "./home/home-motion";
import { LiveStrip } from "./home/live-strip";
import { NightStory } from "./home/night-story";
import { Radar } from "./home/radar";
import { Shield } from "./home/shield";
import { Watches } from "./home/watches";
import { BENCH_ALL, benchFixPct, benchInr, benchInrPerBug, CLIPS } from "./site";
import "./home/home.css";

const d = (n: number) => ({ "--d": n }) as React.CSSProperties;

export default function Home() {

  return (
    <>
      {/* 1. Hero: one promise, one line, two ways in, one calm visual */}
      <section className="hero4" aria-labelledby="hero-h" data-hero>
        <div className="hero4-sky" aria-hidden="true" />
        <div className="frame hero4-grid">
          <div className="hero4-copy">
            <LiveStrip />
            <p className="eyebrow" data-h>
              <span className="eyebrow-dot" aria-hidden="true" /> The AI night watchman for your app
            </p>
            <h1 id="hero-h" className="display hero4-title" data-h>
              Your app breaks at night. <em>JaagteRaho stays awake.</em>
            </h1>
            <p className="hero4-sub" data-h>
              It wakes you only when it matters, finds the cause and brings a checked fix. You approve, or let it heal under your rules.
            </p>
            <p className="hero4-proof" data-h>
              <Link href="/evidence#extended-h">
                <b>{BENCH_ALL.bugs} bugs.</b> <b>{BENCH_ALL.fix_works} fixed and proved by a hidden test.</b> <em>₹{benchInr()} in total.</em>
              </Link>
            </p>
            <div className="actions" data-h>
              <Link className="btn btn-lg" href="/playground">
                Open the playground <span className="arrow" aria-hidden="true">→</span>
              </Link>
              <Link className="btn btn-ghost btn-lg" href="/connect">
                Connect your app
              </Link>
            </div>
          </div>
          <Radar />
        </div>
      </section>

      {/* 2. One night, scroll by scroll */}
      <NightStory />

      {/* 3. What it watches */}
      <section className="section screen watch-band" id="watches" aria-labelledby="watch-h" data-pin-steps="4">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              What it watches
            </p>
            <h2 id="watch-h" className="h-section" data-rv style={d(1)}>
              Not every error deserves your night. <em>These might.</em>
            </h2>
            <p className="lead" data-rv style={d(2)}>
              Scroll, or pick a part of your app: what JaagteRaho does when it fails, and which written rule decides.
            </p>
          </div>
          <Watches />
        </div>
      </section>

      {/* 4. See it work */}
      <section className="section screen clips-band" id="see" aria-labelledby="see-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              See it work
            </p>
            <h2 id="see-h" className="h-section" data-rv style={d(1)}>
              Watch it work, <em>start to finish.</em>
            </h2>
          </div>
          <Clips clips={CLIPS} />
        </div>
      </section>

      {/* 5. How safe is it */}
      <section className="section screen safe-band" id="safety" aria-labelledby="safe-h" data-pin-steps="5">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              How safe is it
            </p>
            <h2 id="safe-h" className="h-section" data-rv style={d(1)}>
              Five layers between a fix <em>and your app.</em>
            </h2>
            <p className="lead" data-rv style={d(2)}>
              You approve, or let it heal under your rules. Either way, every fix passes the same layers first.
            </p>
          </div>
          <Shield />
        </div>
      </section>

      {/* 7. Proof */}
      <section className="section screen proof4" id="proof" aria-labelledby="proof-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              Measured, mistakes counted
            </p>
            <h2 id="proof-h" className="h-section" data-rv style={d(1)}>
              Numbers, <em>not adjectives.</em>
            </h2>
          </div>
          <ul className="nums nums-cost">
            <li className="num-hero" data-rv>
              <Link href="/evidence#extended-h">
                <b>
                  <small>₹</small>
                  <span data-count={benchInrPerBug()}>{benchInrPerBug()}</span>
                  <small> a bug</small>
                </b>
                <span>
                  {BENCH_ALL.bugs} bugs diagnosed, {BENCH_ALL.fix_works} fixed and proved by a hidden test, for <strong>${BENCH_ALL.cost_usd.toFixed(2)}</strong> of AI
                  in total (about ₹{benchInr()}).
                </span>
              </Link>
            </li>
            <li data-rv style={d(1)}>
              <Link href="/evidence#extended-h">
                <b>
                  <span data-count={BENCH_ALL.reached}>{BENCH_ALL.reached}</span>
                  <small>/{BENCH_ALL.bugs}</small>
                </b>
                <span>bugs reached the owner</span>
              </Link>
            </li>
            <li data-rv style={d(2)}>
              <Link href="/evidence#extended-h">
                <b>
                  <span data-count={benchFixPct()}>{benchFixPct()}</span>
                  <small>%</small>
                </b>
                <span>of fixes passed a hidden test the AI never saw</span>
              </Link>
            </li>
            <li data-rv style={d(3)}>
              <Link href="/evidence#extended-h">
                <b>
                  <span data-count={BENCH_ALL.median_decision_s}>{BENCH_ALL.median_decision_s}</span>
                  <small> s</small>
                </b>
                <span>median time to decide: wake you, message you, or stay quiet</span>
              </Link>
            </li>
          </ul>
          <p className="nums-note" data-rv>
            Two benchmark runs (the original 24 cases and 50 more) on {BENCH_ALL.bugs} planted bugs (plus 4 harmless errors) across 7 apps we built and run; ₹ at about ₹{BENCH_ALL.inr_per_usd} to the
            dollar.{" "}
            <Link className="textlink" href="/evidence">
              How each number was measured →
            </Link>
          </p>
        </div>
      </section>

      {/* 8. Close */}
      <section className="close4 screen" aria-labelledby="close-h">
        <div className="close4-glow" aria-hidden="true" />
        <form className="frame close4-inner" action="/connect" method="get">
          <h2 id="close-h" className="h-section" data-rv>
            Sleep tonight. <em>We&apos;ll keep watch.</em>
          </h2>
          <div className="close4-row" data-rv style={d(1)}>
            <label htmlFor="close-name" className="sr-only">
              Your app&apos;s name
            </label>
            <input id="close-name" name="name" type="text" placeholder="your app's name" maxLength={40} autoComplete="off" />
            <button type="submit" className="btn btn-lg">
              Put a watchman on it <span className="arrow" aria-hidden="true">→</span>
            </button>
          </div>
          <p className="soft small" data-rv style={d(2)}>
            Python and Node.js apps · alerts on Telegram · free during HackGlobal 2026
          </p>
        </form>
      </section>
      <HomeMotion />
    </>
  );
}
