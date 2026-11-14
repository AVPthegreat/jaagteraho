import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import Link from "next/link";
import { Lantern } from "./ui/lantern";
import { Motion } from "./ui/motion";
import { NavLinks } from "./ui/nav-links";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], weight: ["400", "500", "700"], style: ["normal", "italic"], variable: "--font-jost" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")),
  title: "JaagteRaho: an AI on-call agent that stays awake for your live app",
  description:
    "Your app breaks at 2 am. If you don't wake up, JaagteRaho heals it: an AI agent that reads every error, wakes you only when real users are hurt, explains the cause with file and line, and writes a checked fix. You approve every fix, or let it heal on its own under rules you set. 20 of 20 planted bugs caught, 0 wrong fixes shown.",
};

export const viewport: Viewport = { themeColor: "#05070a", viewportFit: "cover" };

const REPO = "https://github.com/AVPthegreat/jaagteraho";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jost.variable} suppressHydrationWarning>
      <head>
        {/* Entrance animations only hide content once script is known to run. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="frame">
            <Link href="/" className="wordmark" aria-label="JaagteRaho home">
              <Lantern />
              JaagteRaho
            </Link>
            <NavLinks />
            <Link className="btn" href="/connect">
              Connect your app
            </Link>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="frame">
            <p className="footer-name" aria-hidden="true">
              JaagteRaho
            </p>
            <div className="footer-line">
              <span>An AI night watchman for live apps</span>
              <nav aria-label="Footer">
                <Link href="/#demo">Live demo</Link>
                <Link href="/how">How it works</Link>
                <Link href="/evidence">Evidence</Link>
                <a href={REPO}>Source code on GitHub</a>
              </nav>
              <span>
                HackGlobal 2026 · <Link href="/privacy">Privacy</Link>
              </span>
            </div>
            <div className="footer-notes">
              <p>
                Built for HackGlobal 2026, Track 01 (Agentic and GenAI apps), by Anant Vardhan Pandey. Runs on an AWS server in Mumbai today (moving to
                Vultr when our credits arrive) · decisions and diagnosis by Claude (Anthropic API) · wake-up calls by Gnani · accepts events from the
                open-source Sentry SDKs, not affiliated with Sentry.
              </p>            </div>
          </div>
        </footer>
        <Motion />
      </body>
    </html>
  );
}
