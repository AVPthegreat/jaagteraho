import Link from "next/link";
import { headers } from "next/headers";
import benchmarks from "./evidence/benchmarks.json";
import { Clips } from "./home/clips";
import { HomeMotion } from "./home/home-motion";
import { NightStory } from "./home/night-story";
import { Radar } from "./home/radar";
import { Shield } from "./home/shield";
import { TryIt } from "./home/try-it";
import { Watches } from "./home/watches";
import { CLIPS } from "./site";
import "./home/home.css";

const d = (n: number) => ({ "--d": n }) as React.CSSProperties;

export default async function Home() {
  const country = (await headers()).get("x-vercel-ip-country");
  const bench = benchmarks.jr_bench.after;
  const real = benchmarks.real_bugs.before;

  return (
    <>
      {/* 1. Hero: one promise, one line, two ways in, one calm visual */}
      <section className="hero4" aria-labelledby="hero-h" data-hero>
        <div className="hero4-sky" aria-hidden="true" />
        <div className="frame hero4-grid">
          <div className="hero4-copy">
            <p className="eyebrow" data-h>
              <span className="eyebrow-dot" aria-hidden="true" /> The AI night watchman for your app
            </p>
            <h1 id="hero-h" className="display hero4-title" data-h>
              Your app breaks at night. <em>JaagteRaho stays awake.</em>
            </h1>
            <p className="hero4-sub" data-h>
              It wakes you only when it matters, finds the cause and brings a checked fix. You approve, or let it heal under your rules.
            </p>
            <div className="actions" data-h>
              <a className="btn btn-lg" href="#try">
                Break our demo app <span className="arrow" aria-hidden="true">→</span>
              </a>
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
      <section className="section watch-band" id="watches" aria-labelledby="watch-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              What it watches
            </p>
            <h2 id="watch-h" className="h-section" data-rv style={d(1)}>
              Not every error deserves your night. <em>These might.</em>
            </h2>
            <p className="lead" data-rv style={d(2)}>
              Pick a part of your app to see what JaagteRaho does when it breaks, and which written rule decides.
            </p>
          </div>
          <Watches />
        </div>
      </section>

      {/* 4. See it work */}
      <section className="section clips-band" id="see" aria-labelledby="see-h">
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
      <section className="section safe-band" id="safety" aria-labelledby="safe-h">
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

      {/* 6. Try it yourself */}
      <section className="section try-band" id="try" aria-labelledby="try-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow live" data-rv>
              <i aria-hidden="true" /> Live · no sign-up
            </p>
            <h2 id="try-h" className="h-section" data-rv style={d(1)}>
              Don&apos;t take our word. <em>Break something.</em>
            </h2>
          </div>
          <TryIt country={country && /^[A-Z]{2}$/.test(country) ? country : null} />
        </div>
      </section>

      {/* 7. Proof */}
      <section className="section proof4" id="proof" aria-labelledby="proof-h">
        <div className="frame">
          <div className="section-head">
            <p className="eyebrow" data-rv>
              Measured, mistakes counted
            </p>
            <h2 id="proof-h" className="h-section" data-rv style={d(1)}>
              Numbers, <em>not adjectives.</em>
            </h2>
          </div>
          <ul className="nums">
            <li data-rv>
              <b>
                <span data-count={bench.alerted}>{bench.alerted}</span>
                <small>/{bench.bugs}</small>
              </b>
              <span>planted bugs reached the owner</span>
            </li>
            <li data-rv style={d(1)}>
              <b>
                <span data-count={bench.shown_wrong}>{bench.shown_wrong}</span>
              </b>
              <span>wrong fixes among the {bench.shown} shown, judged by hidden tests</span>
            </li>
            <li data-rv style={d(2)}>
              <b>
                <span data-count={bench.noise_quiet}>{bench.noise_quiet}</span>
                <small>/{bench.noise}</small>
              </b>
              <span>harmless errors kept quiet</span>
            </li>
            <li data-rv style={d(3)}>
              <b>
                <span data-count={bench.median_fix_seconds}>{bench.median_fix_seconds}</span>
                <small> s</small>
              </b>
              <span>median time to a fix that passed every check</span>
            </li>
          </ul>
          <p className="nums-note" data-rv>
            JR-Bench: {bench.bugs} planted bugs and {bench.noise} harmless errors in 7 sample apps. On {real.in_trace.cases} real bugs from open-source
            projects, it named the right file {real.in_trace.right_file} of {real.in_trace.cases} times when the traceback shows it.{" "}
            <Link className="textlink" href="/evidence">
              How each number was measured →
            </Link>
          </p>
        </div>
      </section>

      {/* 8. Close */}
      <section className="close4" aria-labelledby="close-h">
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
