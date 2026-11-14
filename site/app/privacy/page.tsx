import type { Metadata } from "next";
import { HOSTED_ON } from "../site";

export const metadata: Metadata = { title: "Privacy · JaagteRaho" };

const NOTES: Array<[string, React.ReactNode]> = [
  [
    "From apps it watches",
    <>
      Only the error type, a masked message, the stack trace without local variables, the route, the release and the time. Request bodies, URLs&rsquo;
      query strings, headers, cookies, user details, IP addresses and breadcrumbs are dropped before anything is stored. Emails, phone numbers, tokens
      and keys left in what remains are masked. Raw events are deleted after 30 days.
    </>,
  ],
  [
    "Who processes it",
    <>
      The watcher runs on {HOSTED_ON}. Masked error details and the relevant
      source files are sent to Claude through Anthropic&rsquo;s API (United States) for decisions and diagnosis. Alerts go to the owner on Telegram.
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
    "What it will not do",
    <>
      Push straight to your main branch, deploy or restart your servers, or touch login, sessions, payments, exams, grading, settings, config, CI or
      infrastructure code on its own. By default you approve every fix. If you choose a heal rule and give write access to one repository, a heal is a
      pull request that merges only behind your required checks, is rolled back if the errors don&rsquo;t drop, and can be undone in one tap.
    </>,
  ],
];

export default function Privacy() {
  return (
    <>
      <section className="page-head" aria-labelledby="privacy-h">
        <div className="frame head-grid">
          <div>
            <p className="eyebrow">Privacy</p>
            <h1 id="privacy-h" className="display" data-rv>
              What it keeps
            </h1>
            <p className="lead" data-rv style={{ "--d": 1 } as React.CSSProperties}>
              The data note for JaagteRaho: what is stored, who processes it, and what is dropped.
            </p>
          </div>
          <figure className="head-art mask-card" data-ui data-rv style={{ "--d": 2 } as React.CSSProperties}>
            <figcaption className="term-bar">
              <span>one error, before it is stored</span>
            </figcaption>
            <dl>
              <dt>Your app raised</dt>
              <dd>
                <code>LookupError: no student riya.k@college.edu, phone +91 98765 43210</code>
              </dd>
              <dt>JaagteRaho keeps</dt>
              <dd>
                <code>
                  LookupError: no student <mark>[email]</mark>, phone <mark>[phone]</mark>
                </code>
              </dd>
              <dt>Dropped</dt>
              <dd className="mask-dropped">request body · query string · headers · cookies · user details · IP address · breadcrumbs</dd>
            </dl>
          </figure>
        </div>
      </section>
      <section className="section">
        <div className="frame">
          {NOTES.map(([title, body]) => (
            <div className="doc" key={title}>
              <h2 data-rv>{title}</h2>
              <div className="body">
                <p data-rv>
                  {body}
                </p>
              </div>
            </div>
          ))}
          <div className="doc">
            <h2 data-rv>Deleting your data</h2>
            <div className="body">
              <p data-rv>
                This is a hackathon prototype, not a certified service. Ask for anything about you to be deleted and we will do it.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
