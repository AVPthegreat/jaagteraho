/*
  The hero's one visual: a calm radar over the apps it watches. The sweep turns slowly; every
  few seconds one service (the exam portal) flashes, is answered and turns green again.
  Pure SVG and CSS, so it costs no script; with reduced motion it is a still picture.
*/
const C = 280;
const BLIPS: Array<{ id: string; label: string; a: number; r: number; alert?: boolean }> = [
  { id: "exam", label: "exam portal", a: -38, r: 168, alert: true },
  { id: "pay", label: "payments", a: 52, r: 120 },
  { id: "login", label: "login", a: 148, r: 196 },
  { id: "api", label: "api", a: 228, r: 92 },
  { id: "jobs", label: "jobs", a: 300, r: 214 },
];

function at(a: number, r: number) {
  const rad = (a * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

export function Radar() {
  return (
    <figure className="radar" aria-labelledby="radar-cap">
      <svg viewBox="0 0 560 560" role="img" aria-labelledby="radar-cap" focusable="false">
        <defs>
          <radialGradient id="rd-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#14223f" stopOpacity=".9" />
            <stop offset=".7" stopColor="#0b1324" stopOpacity=".6" />
            <stop offset="1" stopColor="#06080d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rd-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7aa7ff" stopOpacity="0" />
            <stop offset="1" stopColor="#7aa7ff" stopOpacity=".42" />
          </linearGradient>
          <radialGradient id="rd-core">
            <stop offset="0" stopColor="#ffd27a" stopOpacity=".95" />
            <stop offset=".35" stopColor="#f5b544" stopOpacity=".35" />
            <stop offset="1" stopColor="#f5b544" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r="276" fill="url(#rd-bg)" />
        <g className="rd-rings" fill="none" stroke="rgba(160,190,255,.16)">
          {[70, 140, 210, 270].map((r) => (
            <circle key={r} cx={C} cy={C} r={r} />
          ))}
          <path d={`M${C} 10V550M10 ${C}H550`} strokeDasharray="2 6" />
        </g>
        <g className="rd-sweep">
          <path d={`M${C} ${C} L${C + 270} ${C} A270 270 0 0 0 ${at(-40, 270).x} ${at(-40, 270).y} Z`} fill="url(#rd-sweep)" />
          <line x1={C} y1={C} x2={C + 270} y2={C} stroke="#a9c6ff" strokeOpacity=".7" strokeWidth="1.2" />
        </g>
        {BLIPS.map((b) => {
          const p = at(b.a, b.r);
          return (
            <g key={b.id} className={`rd-blip${b.alert ? " rd-alert" : ""}`} transform={`translate(${p.x} ${p.y})`}>
              {b.alert && <circle className="rd-ripple" r="10" fill="none" />}
              <circle className="rd-dot" r="5" />
              <text x="12" y="4">
                {b.label}
              </text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="46" fill="url(#rd-core)" className="rd-core" />
        <g transform={`translate(${C - 12} ${C - 14})`} className="rd-lantern">
          <path d="M8 2h8M12 0v2" stroke="#c9d3ea" strokeOpacity=".6" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6 5h12l-1.2 15H7.2L6 5Z" stroke="#f5b544" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(245,181,68,.18)" />
          <ellipse cx="12" cy="12.5" rx="2" ry="3" fill="#ffd27a" />
        </g>
      </svg>
      <figcaption id="radar-cap" className="radar-cap">
        <span className="sr-only">An illustration: JaagteRaho watching five parts of an app. The exam portal flashes an error, then turns healthy again.</span>
        <span className="rc rc-1" aria-hidden="true">
          <i className="ok" /> All quiet · 5 parts watched
        </span>
        <span className="rc rc-2" aria-hidden="true">
          <i className="wake" /> exam portal failing · waking you
        </span>
        <span className="rc rc-3" aria-hidden="true">
          <i className="ok" /> Fixed · watched for 30 min
        </span>
      </figcaption>
    </figure>
  );
}
