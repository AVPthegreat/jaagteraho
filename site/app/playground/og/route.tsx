import { ImageResponse } from "next/og";
import { TITLES } from "../play";

/* The share image for a playground link. It names only a known app, never numbers from the URL. */
export async function GET(req: Request) {
  const app = new URL(req.url).searchParams.get("app");
  const name = app && app in TITLES ? TITLES[app] : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0b1630 0%, #06080d 70%)", color: "#eef1f7", fontFamily: "sans-serif" }}>
        <span style={{ fontSize: 34, fontWeight: 700 }}>JaagteRaho</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 26, color: "#7aa7ff", letterSpacing: 4 }}>LIVE PLAYGROUND</span>
          <span style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>{name ? `Watch it fix a real bug in ${name}.` : "Plant a bug. Watch it heal."}</span>
          <span style={{ fontSize: 30, color: "#a6aec0" }}>Caught, explained, fixed and proved by a hidden test. Live.</span>
        </div>
        <span style={{ fontSize: 24, color: "#5fd6a0" }}>The AI night watchman for your app</span>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
