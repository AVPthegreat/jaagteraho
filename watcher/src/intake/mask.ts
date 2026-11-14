// Masks secrets and personal data in any string that survives the allowlist.
// Runs before anything is stored, sent to a model, sent to Telegram or shown publicly.

const RULES: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // JSON Web Tokens
  [/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g, "[jwt]"],
  // Well-known key formats (Stripe-like, Anthropic, GitHub, Slack, AWS)
  [/\b(?:sk|pk|rk)[-_](?:live|test|ant)[-_][\w-]{6,}/g, "[key]"],
  [/\b(?:ghp|gho|ghs|ghu|github_pat)_\w{10,}/g, "[key]"],
  [/\bxox[abprs]-[\w-]{10,}/g, "[key]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[key]"],
  // key=value or key: value where the key looks secret
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth|authorization|session(?:id)?|cookie|otp|pin)(\s*[=:]\s*)(['"]?)[^\s'",;&)]+\3/gi,
    (_m, k, sep) => `${k}${sep}[redacted]`,
  ],
  // Query strings on URLs
  [/(https?:\/\/[^\s?#'"<>]+)\?[^\s#'"<>]*/g, (_m, base) => `${base}?[query]`],
  // Email addresses
  // (starts only where a run of name characters starts, so a long run without "@" is scanned once, not once per position)
  [/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // Long hex runs (hashes, tokens) and long base64-ish runs without dots or slashes
  [/\b[A-Fa-f0-9]{32,}\b/g, "[hex]"],
  [/\b[A-Za-z0-9+_-]{40,}={0,2}/g, "[token]"],
  // IPv4 addresses
  [/\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g, "[ip]"],
  // Phone numbers: 10+ digits, optional + and separators
  [/(?<![\w.])\+?\d(?:[\s-]?\d){9,14}(?![\w.])/g, "[phone]"],
];

// Every caller clips the result to 500 characters or less, so nothing past this point is ever shown.
// Masking only this much keeps one huge string in an error event from stalling the server.
const MASK_WINDOW = 4096;

export function mask(input: string): string {
  let out = input.length > MASK_WINDOW ? input.slice(0, MASK_WINDOW) : input;
  for (const [re, rep] of RULES) out = out.replace(re, rep as never);
  return out;
}

export function clip(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1)}…`;
}

export const maskClip = (input: unknown, max: number): string | null =>
  typeof input === "string" ? clip(mask(input), max) : null;
