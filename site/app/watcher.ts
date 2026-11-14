export const WATCHER = (process.env.NEXT_PUBLIC_WATCHER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

export type Evidence = {
  runs: number;
  people: number;
  signed: number;
  signed_countries: number;
  signed_live_app: number;
  countries: Array<{ country: string; n: number }>;
  median_seconds: { alert: number | null; cause: number | null; fix: number | null };
  decisions: Record<string, number>;
  owner_marked: Record<string, number>;
  avg_diagnosis_cost_usd: number;
  watching_itself?: { incidents: number; fixes_proposed: number; fixes_applied: number };
};

export async function getEvidence(): Promise<Evidence | null> {
  try {
    const res = await fetch(`${WATCHER}/public/evidence`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as Evidence) : null;
  } catch {
    return null;
  }
}
