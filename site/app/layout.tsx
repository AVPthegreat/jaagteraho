import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { BUILT_WITH, HACKATHON, HACKATHON_ABOUT, HACKATHON_LOGO, HACKATHON_TRACK, HOSTED_ON, LINKEDIN_URL, REPO, TEAM } from "./site";
import { Headroom } from "./ui/headroom";
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
                  <Link href="/playground">Live playground</Link>
                  <Link href="/demo">Exam portal demo</Link>
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
            <div className="footer-with">
              <h2>Built with</h2>
              <ul>
                {BUILT_WITH.map((b) => (
                  <li key={b.name}>
                    <a href={b.href} rel="noopener">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.logo} alt={b.name} height={b.h ?? 24} style={{ height: b.h ?? 24 }} loading="lazy" />
                      <span>{b.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="footer-bottom">
              <div className="footer-event">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="event-logo" src={HACKATHON_LOGO} alt="HackGlobal" width={496} height={82} loading="lazy" />
                <div>
                  <p className="event-mark">
                    <span className="soft">Built for</span> <b>{HACKATHON}</b> · {HACKATHON_TRACK}
                  </p>
                  <p className="soft small">{HACKATHON_ABOUT}</p>
                </div>
              </div>
              <p className="credits">
                Built by{" "}
                {TEAM.map((m, i) => (
                  <span key={m.name}>
                    {i === 1 ? ", with " : i > 1 ? " and " : ""}
                    {i === 0 && LINKEDIN_URL ? (
                      <a href={LINKEDIN_URL} rel="noopener">
                        {m.name}
                      </a>
                    ) : (
                      <b>{m.name}</b>
                    )}
                    {i > 0 && <span className="soft"> ({m.role})</span>}
                  </span>
                ))}
                .
              </p>
              <p className="soft small">
                Runs on {HOSTED_ON}. Accepts events from the open-source Sentry SDKs; not affiliated with Sentry. Logos are trademarks of their owners.
              </p>
            </div>
          </div>
        </footer>
        <Motion />
        <Headroom />
      </body>
    </html>
  );
}
