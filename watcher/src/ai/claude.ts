// Claude calls with a spend ledger and hard caps enforced in code.

import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import type { DB } from "../db/db.js";

const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
const HIGHEST_PRICE: [number, number] = [Math.max(...Object.values(PRICES).map((p) => p[0])), Math.max(...Object.values(PRICES).map((p) => p[1]))];

/** The app a model call is made for, so spend can be charged to its owner's free credit. */
export const spendContext = new AsyncLocalStorage<{ projectId: number }>();

export type Usage = { input_tokens: number; output_tokens: number };

export class SpendGuard {
  constructor(
    private db: DB,
    private haikuOnlyAt: number,
    private stopAt: number,
  ) {}

  total(): number {
    return (this.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend").get() as { t: number }).t;
  }

  countToday(purpose: string): number {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return (this.db.prepare("SELECT COUNT(*) AS n FROM spend WHERE purpose = ? AND at > ?").get(purpose, since) as { n: number }).n;
  }

  /** Returns the model to use, a cheaper one, or null when spending must stop. */
  pick(model: string, cheaper: string): string | null {
    const t = this.total();
    if (t >= this.stopAt) return null;
    if (t >= this.haikuOnlyAt) return cheaper;
    return model;
  }

  record(model: string, purpose: string, usage: Usage): number {
    // A model missing from the table (a new or misspelled id) is charged at the highest known price,
    // never as free, so the spend cap keeps working.
    const [inp, out] = PRICES[model] ?? HIGHEST_PRICE;
    const cost = (usage.input_tokens * inp + usage.output_tokens * out) / 1_000_000;
    this.db
      .prepare("INSERT INTO spend (at, model, purpose, input_tokens, output_tokens, cost_usd, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(new Date().toISOString(), model, purpose, usage.input_tokens, usage.output_tokens, cost, spendContext.getStore()?.projectId ?? null);
    return cost;
  }
}

export type AI = {
  client: Anthropic;
  guard: SpendGuard;
  decisionModel: string;
  diagnosisModel: string;
};

export function makeAI(db: DB): AI | null {
  const apiKey = process.env.JR_ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    client: new Anthropic({ apiKey, maxRetries: 1 }),
    guard: new SpendGuard(db, Number(process.env.JR_SPEND_HAIKU_ONLY_AT ?? 40), Number(process.env.JR_SPEND_STOP_AT ?? 45)),
    decisionModel: process.env.JR_DECISION_MODEL ?? "claude-haiku-5-5",
    diagnosisModel: process.env.JR_DIAGNOSIS_MODEL ?? "claude-sonnet-5-5",
  };
}

/** Wraps untrusted text so the model reads it as data. */
export function fence(tag: string, text: string): string {
  const safe = text.replaceAll(`</${tag}`, `<\\/${tag}`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}
