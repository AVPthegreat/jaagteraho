// Parses a Sentry envelope: one JSON header line, then item-header / payload pairs.
// Item headers may carry a byte `length`; without it the payload runs to the next newline.
// Verified against sentry-sdk 2.71.0 on 13 Nov 2026 (see test/fixtures).

export type EnvelopeItem = { header: Record<string, unknown>; payload: Buffer };
export type Envelope = { header: Record<string, unknown>; items: EnvelopeItem[] };

const NL = 0x0a;

function readLine(buf: Buffer, start: number): [Buffer, number] {
  const end = buf.indexOf(NL, start);
  return end === -1 ? [buf.subarray(start), buf.length] : [buf.subarray(start, end), end + 1];
}

function parseJson(bytes: Buffer, what: string): Record<string, unknown> {
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what} is not a JSON object`);
  return value as Record<string, unknown>;
}

export function parseEnvelope(buf: Buffer, maxItems = 20): Envelope {
  let [line, pos] = readLine(buf, 0);
  const header = parseJson(line, "envelope header");
  const items: EnvelopeItem[] = [];

  while (pos < buf.length) {
    [line, pos] = readLine(buf, pos);
    if (line.length === 0 || line.toString("utf8").trim() === "") continue;
    const itemHeader = parseJson(line, "item header");
    let payload: Buffer;
    const length = itemHeader.length;
    if (typeof length === "number" && Number.isInteger(length) && length >= 0) {
      if (pos + length > buf.length) throw new Error("item length runs past the end of the envelope");
      payload = buf.subarray(pos, pos + length);
      pos += length;
      if (buf[pos] === NL) pos += 1;
    } else {
      [payload, pos] = readLine(buf, pos);
    }
    items.push({ header: itemHeader, payload });
    if (items.length > maxItems) throw new Error("too many items in one envelope");
  }
  return { header, items };
}
