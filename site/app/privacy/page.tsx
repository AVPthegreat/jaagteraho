import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · JaagteRaho" };

export default function Privacy() {
  return (
    <section className="section" style={{ borderTop: 0 }}>
      <p className="eyebrow">Data note</p>
      <h2>What JaagteRaho keeps</h2>
      <div className="prose">
        <p>
          <strong>From apps it watches:</strong> only the error type, a masked message, the stack trace without local variables, the route, the
          release and the time. Request bodies, URLs&apos; query strings, headers, cookies, user details, IP addresses and breadcrumbs are dropped
          before anything is stored. Emails, phone numbers, tokens and keys left in what remains are masked. Raw events are deleted after 30 days.
        </p>
        <p>
          <strong>Who processes it:</strong> the watcher runs on a Vultr server. Masked error details and the relevant source files are sent to
          Claude through Anthropic&apos;s API (United States) for decisions and diagnosis. Alerts go to the owner on Telegram. Spoken wake-up
          calls use a text-to-speech provider and contain only flow names and counts.
        </p>
        <p>
          <strong>From this website:</strong> an anonymous session id, your country as reported by our host, and, only if you sign the logbook,
          the name or handle and country you type. We use them to count real users for HackGlobal 2026.
        </p>
        <p>
          <strong>What it never does:</strong> merge, deploy, restart or roll back anything on its own, or change login, payments, grading or
          settings code.
        </p>
        <p className="muted">This is a hackathon prototype, not a certified service. Ask for anything about you to be deleted and we will do it.</p>
      </div>
    </section>
  );
}
