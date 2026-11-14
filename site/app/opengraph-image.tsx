import { ImageResponse } from "next/og";

export const alt = "JaagteRaho: an AI night watchman that wakes you only when your live app really breaks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card in the site's look: the night ground, the lantern-lit stage, and the owner's logbook on it.
export default function Image() {
  const row = (time: string, text: string, color = "#e9eef4") => (
    <div style={{ display: "flex", gap: 24, padding: "14px 0", borderBottom: "1px solid #2b3a4a", fontSize: 24 }}>
      <span style={{ color: "#8d9aab", width: 76, flexShrink: 0 }}>{time}</span>
      <span style={{ color }}>{text}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#05070a", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 520, padding: "56px 0 56px 64px", flexShrink: 0 }}>
          <span style={{ color: "#ffffff", fontSize: 34, fontWeight: 700 }}>JaagteRaho</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <span style={{ color: "#ffffff", fontSize: 70, fontWeight: 800, lineHeight: 0.95, letterSpacing: -2 }}>YOUR APP BREAKS AT 2 AM.</span>
            <span style={{ color: "#a9b0c2", fontSize: 30, lineHeight: 1.3 }}>If you don&apos;t wake up, JaagteRaho heals it.</span>
          </div>
          <span style={{ color: "#f2b441", fontSize: 22 }}>Break the demo yourself · HackGlobal 2026</span>
        </div>
        <div style={{ flex: 1, display: "flex", background: "#f2b441", marginTop: 96, marginLeft: 40, padding: "48px 0 0 48px" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0e1621", borderRadius: "14px 0 0 0", padding: "16px 32px" }}>
            {row("00:00", "KeyError on /api/submit")}
            <div style={{ display: "flex", gap: 24, padding: "18px 0", borderBottom: "1px solid #2b3a4a", alignItems: "center" }}>
              <span style={{ color: "#8d9aab", width: 76, fontSize: 24, flexShrink: 0 }}>00:02</span>
              <span style={{ color: "#ff6b5b", fontSize: 34, fontWeight: 800, border: "4px solid #ff6b5b", borderRadius: 8, padding: "2px 14px", transform: "rotate(-4deg)", whiteSpace: "nowrap", letterSpacing: 2 }}>
                WOKE OWNER
              </span>
            </div>
            {row("00:06", "Cause, in plain words")}
            {row("00:10", "Fix proposed · checks passed", "#57d39b")}
            {row("00:12", "Healed on its own", "#57d39b")}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
