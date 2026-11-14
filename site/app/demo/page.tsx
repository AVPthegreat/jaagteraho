import type { Metadata } from "next";
import { headers } from "next/headers";
import { DemoSection } from "../ui/demo-section";
import { getEvidence } from "../watcher";

export const metadata: Metadata = {
  title: "Break our exam portal · JaagteRaho",
  description: "Break a real demo exam portal and watch JaagteRaho decide, wake the owner, explain the cause and heal it, live, with a timer. No sign-up.",
};

export default async function Demo() {
  const country = (await headers()).get("x-vercel-ip-country");
  const ev = await getEvidence();
  return (
    <section className="section demo-page" id="demo" aria-labelledby="demo-h">
      <div className="frame">
        <DemoSection ev={ev} country={country && /^[A-Z]{2}$/.test(country) ? country : null} headingId="demo-h" level={1} />
      </div>
    </section>
  );
}
