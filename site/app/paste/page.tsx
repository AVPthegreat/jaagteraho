import type { Metadata } from "next";
import { PasteForm } from "./paste-form";

export const metadata: Metadata = { title: "Paste your error · JaagteRaho" };

export default async function Paste({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <>
      <section className="page-head field-night" aria-labelledby="paste-h">
        <div className="frame grid">
          <h1 id="paste-h" className="display" data-rv>
            Paste your error
          </h1>
          <p className="lead" data-rv style={{ "--d": 1 } as React.CSSProperties}>See what JaagteRaho would tell you about an error you already have, without connecting anything.</p>
        </div>
      </section>
      <section className="section">
        <div className="frame">
          <PasteForm
            initialId={id && /^[0-9a-f]{12}$/.test(id) ? id : null}
            intro={
              <div className="prose">
                <p className="lead" data-rv>
                  Paste a Python traceback or a JavaScript (Node.js or browser) stack trace from your app and the link to its public GitHub repository.
                </p>
                <p data-rv style={{ "--d": 1 } as React.CSSProperties}>
                  JaagteRaho reads the files the traceback names, explains the cause in plain words and, if it passes every safety check, shows a fix you
                  can apply yourself. Press <b>Diagnose</b> and the result appears in the Diagnosis panel in about 10 seconds; <b>Copy share link</b> gives
                  you a link to that result.
                </p>
              </div>
            }
          />
        </div>
      </section>
    </>
  );
}
