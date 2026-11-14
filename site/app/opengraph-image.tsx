import { ImageResponse } from "next/og";

export const alt = "JaagteRaho: an AI night watchman that wakes you only when your live app really breaks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card: a logbook entry with the stamp, in the site's night-watch look.
export default function Image() {
  const row = (time: string, text: string, color = "#e6ebf5") => (
    <div style={{ display: "flex", gap: 28, padding: "14px 0", borderBottom: "1px dashed #26385a", fontSize: 25 }}>
      <span style={{ color: "#a7b6d2", width: 84, flexShrink: 0 }}>{time}</span>
      <span style={{ color }}>{text}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0e1626", padding: 56, gap: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 500, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <span style={{ color: "#f2b441", fontSize: 24, letterSpacing: 4 }}>NIGHT WATCH FOR LIVE APPS</span>
            <span style={{ color: "#e6ebf5", fontSize: 76, fontWeight: 800, lineHeight: 1 }}>JaagteRaho</span>
            <span style={{ color: "#a7b6d2", fontSize: 32, lineHeight: 1.3 }}>
              Wakes you only when your app really breaks, explains why in plain words, and has a fix waiting.
            </span>
          </div>
          <span style={{ color: "#a7b6d2", fontSize: 22 }}>Break the demo yourself · HackGlobal 2026</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#142036", border: "2px solid #26385a", borderRadius: 14, padding: "18px 32px" }}>
          {row("00:00", "KeyError on /api/submit")}
          <div style={{ display: "flex", gap: 28, padding: "18px 0", borderBottom: "1px dashed #26385a", alignItems: "center" }}>
            <span style={{ color: "#a7b6d2", width: 84, fontSize: 25, flexShrink: 0 }}>00:02</span>
            <span style={{ color: "#ff6b5b", fontSize: 38, fontWeight: 800, border: "4px solid #ff6b5b", borderRadius: 8, padding: "2px 16px", transform: "rotate(-4deg)", whiteSpace: "nowrap", letterSpacing: 2 }}>
              WOKE OWNER
            </span>
          </div>
          {row("00:03", "Hindi wake-up call sent", "#f2b441")}
          {row("00:06", "Cause, in plain words")}
          {row("00:10", "Fix proposed · checks passed", "#63d2a1")}
        </div>
      </div>
    ),
    { ...size },
  );
}
