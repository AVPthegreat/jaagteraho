import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { HACKATHON, HOSTED_ON, REPO, TEAM, THANKS } from "./site";
import { Lantern } from "./ui/lantern";
import { Motion } from "./ui/motion";
import { SiteNav } from "./ui/nav-links";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], axes: ["opsz", "SOFT"], style: ["normal", "italic"], variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")),
  title: "JaagteRaho: the AI night watchman for your live app",
  description:
    "Your app breaks at night. JaagteRaho stays awake: it wakes you only when it matters (Telegram, a phone call), finds the cause with file and line, and brings a fix checked by code rules, an AI reviewer and its own test. You approve, or let it heal under your rules. 20 of 20 planted bugs reached the owner, 0 wrong fixes among 19 shown.",
};

export const viewport: Viewport = { themeColor: "#06080d", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Entrance animations only hide content once script is known to run. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="frame header-row">
            <Link href="/" className="wordmark" aria-label="JaagteRaho home">
              <Lantern size={26} />
              <span>JaagteRaho</span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="frame">
            <div className="footer-top">
              <div className="footer-brand">
                <Link href="/" className="wordmark" aria-label="JaagteRaho home">
                  <Lantern size={26} />
                  <span>JaagteRaho</span>
                </Link>
                <p>Hindi for &ldquo;stay awake&rdquo;, the night watchman&apos;s call. An AI on-call agent for people who run a live app alone.</p>
              </div>
              <nav aria-label="Footer" className="footer-nav">
                <div>
                  <h2>Try it</h2>
                  <Link href="/demo">Live demo</Link>
                  <Link href="/paste">Paste your error</Link>
                  <Link href="/connect">Connect your app</Link>
                </div>
                <div>
                  <h2>Learn</h2>
                  <Link href="/how">How it works</Link>
                  <Link href="/evidence">Evidence</Link>
                  <Link href="/privacy">Privacy</Link>
                </div>
                <div>
                  <h2>Source</h2>
                  <a href={REPO}>GitHub repository</a>
                  <a href={`${REPO}/blob/main/docs/ARCHITECTURE.md`}>System design</a>
                </div>
              </nav>
            </div>
            <div className="footer-bottom">
              <p className="credits">
                <b>Built by</b>{" "}
                {TEAM.map((m, i) => (
                  <span key={m.name}>
                    {i === 1 ? ", with " : i > 1 ? " and " : ""}
                    {m.href ? <a href={m.href}>{m.name}</a> : m.name}
                    {i > 0 && <span className="soft"> ({m.role})</span>}
                  </span>
                ))}
                . <span className="soft">{THANKS}</span>
              </p>
              <p>
                <b>Built for</b> {HACKATHON}
              </p>
              <p className="soft">
                Runs on {HOSTED_ON}. Decisions and diagnosis by Claude (Anthropic API). Wake-up voice by Gnani. Accepts events from the open-source Sentry
                SDKs; not affiliated with Sentry.
              </p>
            </div>
          </div>
        </footer>
        <Motion />
      </body>
    </html>
  );
}
