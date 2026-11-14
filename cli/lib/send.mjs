// Sends one test error to JaagteRaho in the same format the Sentry SDKs use, tagged as a test,
// so the owner gets a "connected" message on Telegram without any model being called.

import { randomUUID } from "node:crypto";

export function parseDsn(dsn) {
  let u;
  try {
    u = new URL(dsn);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const projectId = parts.pop();
  if (!u.username || !projectId || !/^\d+$/.test(projectId)) return null;
  const prefix = parts.length ? `/${parts.join("/")}` : "";
  return { key: u.username, projectId, envelopeUrl: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/` };
}

export async function sendTestError(dsn, platform = "other") {
  const d = parseDsn(dsn);
  if (!d) return { ok: false, error: "That SENTRY_DSN doesn't look right." };
  const eventId = randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform,
    level: "error",
    transaction: "/jaagteraho-test",
    tags: { jr_test: "1" },
    sdk: { name: "jaagteraho.cli", version: "0.1.0" },
    exception: { values: [{ type: "JaagteRahoTestError", value: "Test error sent by npx jaagteraho. Your setup works." }] },
  };
  const body = JSON.stringify(event);
  const envelope = `${JSON.stringify({ event_id: eventId, dsn, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event", length: Buffer.byteLength(body) })}\n${body}\n`;
  try {
    const res = await fetch(d.envelopeUrl, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=jaagteraho-cli/0.1.0` },
      body: envelope,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 401 || res.status === 403 ? "JaagteRaho did not accept this DSN's key." : `JaagteRaho answered ${res.status}.` };
  } catch (e) {
    return { ok: false, error: `Could not reach ${new URL(d.envelopeUrl).host} (${e?.cause?.code ?? e?.name ?? "network error"}).` };
  }
}
