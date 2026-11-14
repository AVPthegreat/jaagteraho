// Groups repeated errors: same project, error type, top in-app frame and route = same incident.
// The message is left out on purpose because it often carries changing values.

import { createHash } from "node:crypto";
import type { CleanEvent, CleanFrame } from "./allowlist.js";

export function topFrame(frames: CleanFrame[]): CleanFrame | null {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].in_app) return frames[i];
  return frames.at(-1) ?? null;
}

export function fingerprint(projectId: number, ev: CleanEvent): string {
  const top = topFrame(ev.frames);
  const parts = [
    String(projectId),
    ev.exception_type,
    top?.module ?? top?.filename ?? "",
    top?.function ?? "",
    ev.transaction ?? "",
    // Message-only events have no frames; their normalised text is all we have.
    ev.frames.length === 0 ? ev.message.replace(/\d+/g, "#") : "",
  ];
  return createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 20);
}
