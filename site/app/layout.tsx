import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Big_Shoulders, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")),
  title: "JaagteRaho: an AI night watchman for your live app",
  description:
    "Break our demo exam portal and watch an AI watchman decide whether to wake the owner, explain the cause in plain words and propose a fix only the owner can approve.",
};

export const viewport: Viewport = { themeColor: "#0e1626", viewportFit: "cover" };

function Lantern() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M10 6h8M11 6v3h6V6M9 9h10l-1 12H10L9 9Z" stroke="#f2b441" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 13v4" stroke="#f2b441" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 24h12" stroke="#a7b6d2" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="JaagteRaho home">
              <Lantern />
              <span>
                Jaagte<b>Raho</b>
              </span>
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Break it</Link>
              <Link href="/paste">Paste your error</Link>
              <Link href="/connect">Connect your app</Link>
              <Link href="/evidence">Evidence</Link>
              <Link href="/how">How it works</Link>
              <Link href="/privacy">Privacy</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>
              Backend on Vultr · decisions and diagnosis by Claude (Anthropic API) · wake-up calls by Gnani · accepts events from the
              open-source Sentry SDKs, not affiliated with Sentry
            </span>
            <span>Built for HackGlobal 2026</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
