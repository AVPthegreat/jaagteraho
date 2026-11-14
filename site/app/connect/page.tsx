import type { Metadata } from "next";
import Link from "next/link";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: "Connect your app · JaagteRaho" };

export default async function Connect({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  const initialName = typeof name === "string" ? name.slice(0, 40) : "";
  return (
    <>
      <section className="page-head" aria-labelledby="connect-h">
        <div className="frame">
          <p className="eyebrow">Connect</p>
          <h1 id="connect-h" className="display" data-rv>
            Connect your app
          </h1>
          <p className="lead" data-rv style={{ "--d": 1 } as React.CSSProperties}>Put a night watchman on your app. Free during HackGlobal 2026.</p>
        </div>
      </section>

      <section className="section">
        <div className="frame split">
          <div className="side prose">
            <p className="lead" data-rv>
              Two minutes: name your app here (or send <code>/new myapp</code> to the bot), run one command in your project, and deploy.
            </p>
            <p data-rv style={{ "--d": 1 } as React.CSSProperties}>
              JaagteRaho then decides which errors deserve your attention, explains each one in plain words on Telegram, and proposes small, checked
              fixes. You approve every fix, or let it heal on its own under rules you set.
            </p>
            <p className="soft" data-rv style={{ "--d": 2 } as React.CSSProperties}>
              Every Telegram account gets $5 of free AI credit, about 375 diagnoses at our measured 1.3 cents each; deciding and alerting cost almost
              nothing. Limits while we are a prototype: 3 apps per account and 5 diagnoses a day per app. Healing your app on its own needs write
              access to its repository, which we set up with you by hand for now; until then every fix arrives as a ready-to-apply diff.
            </p>
            <p className="soft" data-rv style={{ "--d": 3 } as React.CSSProperties}>
              <b>What the form does:</b> it creates your app in JaagteRaho and shows you a button that links your Telegram (alerts go only to you), a
              one-line setup command with your app&apos;s private error address in it, the same address for setting up by hand, and a logs address
              for a log drain. Nothing is installed until you run the command yourself.
            </p>
            <p>
              <Link className="textlink" href="/how">
                See every step, and what reaches your phone →
              </Link>
            </p>
          </div>
          <div className="main panel" data-rv style={{ "--d": 1 } as React.CSSProperties}>
            <ConnectForm initialName={initialName} />
          </div>
        </div>
      </section>
    </>
  );
}
