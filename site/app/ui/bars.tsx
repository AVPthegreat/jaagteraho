import benchmarks from "../evidence/benchmarks.json";

type Row = { id: string; kind: string; decision: string; gate: string | null };

/* How loudly each decision reaches the owner: the bar's height, as a share of the chart. */
const LOUDNESS: Record<string, number> = { wake: 84, notify: 50, log: 10, ignore: 4 };
const SAID: Record<string, string> = { wake: "woke the owner", notify: "messaged the owner", log: "kept for the 08:00 summary", ignore: "kept quiet" };
const GATE: Record<string, string> = { recommended: "fix recommended", caution: "fix shown: use with care", withheld: "fix withheld (safety rule)" };

/*
  JR-Bench, drawn as the product's own chart: one bar per error in the benchmark (20 planted bugs, 4 harmless ones),
  standing as tall as the alert it got. Every value comes from benchmarks.json.
*/
export function Bars() {
  const rows = (benchmarks.jr_bench.after?.rows ?? []) as Row[];
  const count = (d: string) => rows.filter((r) => r.decision === d).length;
  const firstOf = (d: string) => rows.findIndex((r) => r.decision === d);
  const groups = [
    { kind: "notify", at: firstOf("notify") + 1, value: `Messaged you · ${count("notify")}`, note: "bugs that hurt users" },
    { kind: "wake", at: firstOf("wake"), value: `Woke you · ${count("wake")}`, note: "exam-time bugs on a critical route" },
    { kind: "quiet", at: rows.length - 1, value: `Kept quiet · ${count("ignore") + count("log")}`, note: "harmless errors" },
  ];

  return (
    <div className="chart" style={{ "--n": rows.length } as React.CSSProperties}>
      <div className="plot">
      <ol className="bars" data-ui aria-label={`The ${rows.length} benchmark errors and what JaagteRaho did with each`}>
        {rows.map((r, i) => {
          const kind = r.decision === "wake" ? "wake" : r.decision === "notify" ? "notify" : "quiet";
          const tip = `${r.id}: ${SAID[r.decision] ?? r.decision}${r.gate ? `, ${GATE[r.gate] ?? r.gate}` : ""}`;
          return (
            <li key={r.id} className={`bar ${kind}`} style={{ "--h": `${LOUDNESS[r.decision] ?? 4}%`, "--i": i } as React.CSSProperties} tabIndex={0} aria-label={tip}>
              <span className="bar-tip" aria-hidden="true">
                {tip}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="bar-labels" aria-hidden="true">
        {groups.map((g) => (
          <span
            key={g.kind}
            className={`bar-value ${g.kind}`}
            style={{ "--x": g.at, "--h": `${LOUDNESS[g.kind === "quiet" ? "ignore" : g.kind]}%` } as React.CSSProperties}
          >
            {g.value}
            <small>{g.note}</small>
          </span>
        ))}
      </div>
      </div>
      <ul className="bars-legend frame">
        {groups.map((g) => (
          <li key={g.kind} className={g.kind}>
            <b>{g.value}</b> {g.note}
          </li>
        ))}
      </ul>
      <p className="bars-key small frame">
        Each bar is one error from JR-Bench, our test set of {rows.length} errors, as tall as the alert it got: woke you, messaged you, or kept quiet.
        <span className="hover-hint"> Hover or focus a bar for the case.</span>
      </p>
    </div>
  );
}
