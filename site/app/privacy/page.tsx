import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · JaagteRaho" };

const NOTES: Array<[string, React.ReactNode]> = [
  [
    "From apps it watches",
    <>
      Only the error type, a masked message, the stack trace without local variables, the route, the release and the time. Request bodies, URLs&apos;
      query strings, headers, cookies, user details, IP addresses and breadcrumbs are dropped before anything is stored. Emails, phone numbers, tokens
      and keys left in what remains are masked. Raw events are deleted after 30 days.
    </>,
  ],
  [
    "Who processes it",
    <>
      The watcher runs on an AWS server in Mumbai, India (it moves to Vultr when our hackathon credits arrive). Masked error details and the relevant
      source files are sent to Claude through Anthropic&apos;s API (United States) for decisions and diagnosis. Alerts go to the owner on Telegram.
      Spoken wake-up calls use a text-to-speech provider and contain only flow names and counts.
    </>,
  ],
  [
    "From this website",
    <>
      An anonymous session id, your country as reported by our host, and, only if you sign the logbook, the name or handle and country you type. We
      use them to count real users for HackGlobal 2026.
    </>,
  ],
  [
    "What it never does",
    <>Merge, deploy, restart or roll back anything on its own, or change login, payments, grading or settings code.</>,
  ],
];

export default function Privacy() {
  return (
    <>
      <section className="page-head field-night" aria-labelledby="privacy-h">
        <div className="frame grid">
          <h1 id="privacy-h" className="display">
            What it keeps
          </h1>
          <p className="lead">The data note for JaagteRaho: what is stored, who processes it, and what is dropped.</p>
        </div>
      </section>
      <section className="section">
        <div className="frame docs-tight">
          {NOTES.map(([title, body]) => (
            <div className="grid doc" key={title}>
              <h2>{title}</h2>
              <div className="body">
                <p>
                  {body}
                </p>
              </div>
            </div>
          ))}
          <div className="grid doc">
            <h2>Deleting your data</h2>
            <div className="body">
              <p>
                This is a hackathon prototype, not a certified service. Ask for anything about you to be deleted and we will do it.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
