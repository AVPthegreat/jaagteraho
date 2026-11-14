// Local preview of the Live playground with a STAND-IN model: no API key, no spend, no network.
// Real planted bugs, real crashes, real proofs and hidden tests; only the model's answers are canned
// (a correct fix for messmenu's missing-plates bug, "no edit" for everything else).
// Usage: npx tsx scripts/playground-dev.ts   (serves http://127.0.0.1:8790; never point it at production)

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { openDb } from "../src/db/db.js";
import { Playground } from "../src/playground/runner.js";
import { playgroundRoutes } from "../src/web/playground.js";
import { standInAI } from "./standin.js";

const db = openDb(":memory:");
const ai = standInAI(db);
const pg = new Playground(db, ai, { canSpend: () => true, everyMs: Number(process.env.EVERY_MS ?? 30_000) });
pg.start();
const app = new Hono();
app.route("/", playgroundRoutes(pg, ["http://localhost:3000", "http://127.0.0.1:3000"]));
serve({ fetch: app.fetch, port: 8790, hostname: "127.0.0.1" }, () => console.log("playground preview (stand-in model) on http://127.0.0.1:8790"));
