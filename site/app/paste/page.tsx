import type { Metadata } from "next";
import { PasteForm } from "./paste-form";

export const metadata: Metadata = { title: "Paste your error · JaagteRaho" };

export default async function Paste({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <section className="section" style={{ borderTop: 0 }}>
      <p className="eyebrow">For your own app</p>
      <h2>Paste your error</h2>
      <div className="prose muted">
        <p>
          Paste a Python traceback or a JavaScript (Node.js or browser) stack trace from your app and the link to its public GitHub repository. JaagteRaho reads the files the traceback names,
          explains the cause in plain words and, if it passes every safety check, shows a fix you can apply yourself.
        </p>
      </div>
      <PasteForm initialId={id && /^[0-9a-f]{12}$/.test(id) ? id : null} />
    </section>
  );
}
