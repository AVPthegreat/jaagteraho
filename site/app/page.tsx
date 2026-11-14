import { headers } from "next/headers";
import { BreakIt } from "./break-it";
import { getEvidence } from "./watcher";

const num = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "—" : `${v}${unit}`);

export default async function Home() {
  const h = await headers();
  const country = h.get("x-vercel-ip-country");
  const ev = await getEvidence();
  const countries = ev?.countries.length ?? 0;

  return (
    <>
      <BreakIt country={country && /^[A-Z]{2}$/.test(country) ? country : null} />

      <section aria-label="Measured so far" className="measured">
        <div>
          <strong>{num(ev?.median_seconds.alert, " s")}</strong>
          <span>median time from error to alert</span>
        </div>
        <div>
          <strong>{num(ev?.median_seconds.cause, " s")}</strong>
          <span>median time to the cause</span>
        </div>
        <div>
          <strong>{ev ? ev.runs : "—"}</strong>
          <span>runs on this page</span>
        </div>
        <div>
          <strong>{ev ? ev.people : "—"}</strong>
          <span>
            people tried it, from {countries} {countries === 1 ? "country" : "countries"}
          </span>
        </div>
      </section>

      <section className="section" id="how" aria-labelledby="how-h">
        <h2 id="how-h">How it works</h2>
        <ol className="steps">
          <li>
            <b>1 · Connect</b>
            <span>
              <code className="mono">/new myapp</code> on Telegram, then <code className="mono">npx jaagteraho init</code> in your project: it adds the
              free error package, shows every change first and sends a test error. No code at all? Forward your host&apos;s logs instead.
            </span>
          </li>
          <li>
            <b>2 · Decide</b>
            <span>
              Claude answers fixed questions about each error, five times. Rules you can read decide: ignore, log, notify or wake you. A failed
              exam submission wakes you; a cosmetic bug waits till morning.
            </span>
          </li>
          <li>
            <b>3 · Explain</b>
            <span>
              The cause in plain words, with file and line, and the commit that went live just before it broke. On Telegram; the alert edits itself
              as the work moves.
            </span>
          </li>
          <li>
            <b>4 · Propose</b>
            <span>
              A small fix, checked six ways by code and reviewed again by Claude, with a test that proves it on the demo. Concerns are spelled out,
              never hidden. It never merges, deploys or touches payments, grading or login on its own.
            </span>
          </li>
        </ol>
        <p style={{ margin: 0 }}>
          <a href="/how">
            <b>Every step in detail: setup, what reaches your phone, and what happens at 2 am →</b>
          </a>
        </p>
        {ev?.watching_itself && ev.watching_itself.incidents > 0 && (
          <div className="panel" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
            <strong className="display" style={{ fontSize: 30, color: "var(--lantern)", fontWeight: 800 }}>
              It watches itself.
            </strong>
            <span style={{ flex: "1 1 360px", minWidth: 0 }}>
              JaagteRaho runs its own code through the same pipeline. While we built it, it caught {ev.watching_itself.incidents} crashes in
              itself, explained each one in plain words and proposed {ev.watching_itself.fixes_proposed} fixes; we applied{" "}
              {ev.watching_itself.fixes_applied} of them as written.
            </span>
          </div>
        )}
        <div className="prose muted">
          <p>
            Built because I run Faurus, a coding and exam platform used by colleges, alone. Its server errors went to a log nobody read. If it
            broke during an exam at 2 am, I heard it from a student.
          </p>
        </div>
      </section>
    </>
  );
}
