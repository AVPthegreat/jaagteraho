/** A whole-number setting from the environment, kept inside [lo, hi]; anything missing or invalid gives the default. */
export function envInt(name: string, fallback: number, lo: number, hi: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < lo || n > hi) return fallback;
  return n;
}
