import type { Metadata } from "next";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: "Connect your app · JaagteRaho" };

export default function Connect() {
  return (
    <section className="section" style={{ borderTop: 0 }}>
      <p className="eyebrow">Free during HackGlobal 2026</p>
      <h2>Put a night watchman on your app</h2>
      <div className="prose muted">
        <p>
          Two minutes: name your app here (or send <code className="mono">/new myapp</code> to the bot), run one command in your project, and
          deploy. JaagteRaho then decides which errors deserve your attention, explains each one in plain words on Telegram, and proposes small,
          checked fixes you apply yourself.
        </p>
        <p>
          Every Telegram account gets $5 of free AI credit, about 375 diagnoses at our measured 1.3 cents each; deciding and alerting cost
          almost nothing. Limits while we are a prototype: 3 apps per account, 5 diagnoses a day per app, and fixes are diffs only. We never
          write to your code.
        </p>
        <p>
          <b>What the form below does:</b> it creates your app in JaagteRaho and shows you a button that links your Telegram (alerts go only to
          you), a one-line setup command with your app&apos;s private error address in it, the same address for setting up by hand, and a logs
          address for a log drain. Nothing is installed until you run the command yourself.
        </p>
        <p>
          <a href="/how">See every step, and what reaches your phone →</a>
        </p>
      </div>
      <ConnectForm />
    </section>
  );
}
