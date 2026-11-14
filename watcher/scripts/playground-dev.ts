// Local preview of the Live playground with a STAND-IN model: no API key, no spend, no network.
// Real planted bugs, real crashes, real proofs and hidden tests; only the model's answers are canned
// (a correct fix for messmenu's missing-plates bug, "no edit" for everything else).
// Usage: npx tsx scripts/playground-dev.ts   (serves http://127.0.0.1:8790; never point it at production)

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SpendGuard, type AI } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { Playground } from "../src/playground/runner.js";
import { playgroundRoutes } from "../src/web/playground.js";

const db = openDb(":memory:");
const usage = { input_tokens: 3000, output_tokens: 400 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const client = {
  messages: {
    parse: async (req: { system: string; messages: Array<{ content: string }> }) => {
      const text = String(req.messages[0]?.content ?? "");
      if (req.system.includes("You assess one production error")) {
        await wait(700);
        return { stop_reason: "end_turn", usage, parsed_output: { is_noise: "no", severity: "3", category: "unhandled_input", user_blocked: "yes", suggested_action: "notify" } };
      }
      if (req.system.includes("diagnosis step")) {
        await wait(4000);
        const plates = text.includes("KeyError") && text.includes("plates");
        return {
          stop_reason: "end_turn",
          usage,
          parsed_output: plates
            ? {
                cause_plain: "Booking a meal without the number of plates crashes: the form check stopped asking for plates, but the booking code still reads it.",
                cause_technical: "messmenu/booking/routes.py line 13: require_fields no longer lists 'plates', so service.create reads a missing key.",
                file: "messmenu/booking/routes.py",
                line: 13,
                confidence_words: "sure",
                edits: [{ file: "messmenu/booking/routes.py", find: 'require_fields(body, "student", "meal_id", "booked_on")', replace: 'require_fields(body, "student", "meal_id", "plates", "booked_on")' }],
                test_hint: "Book a meal without plates: you get a clear 400.",
                regression_test: {
                  file: "tests/test_booking.py",
                  code: "import unittest\nfrom messmenu.app import handle\n\nclass T(unittest.TestCase):\n    def test_booking_without_plates(self):\n        handle('POST', '/api/meals', {'title': 'Rajma', 'price': '60', 'served_on': '2026-11-13', 'plates': 200})\n        r = handle('POST', '/api/bookings', {'student': 'Asha', 'meal_id': 1, 'booked_on': '2026-11-13'})\n        self.assertEqual(r['status'], 400)\n",
                },
              }
            : { cause_plain: "Stand-in model: no answer for this bug.", cause_technical: "stand-in", file: "", line: 0, confidence_words: "guess", edits: [], test_hint: "", regression_test: { file: "", code: "" } },
        };
      }
      await wait(1200);
      return { stop_reason: "end_turn", usage, parsed_output: { fix_quality: "3", touches_sensitive: "no", could_break: "no" } };
    },
  },
};
const ai = { client, guard: new SpendGuard(db, 40, 45), decisionModel: "claude-haiku-5-5", diagnosisModel: "claude-sonnet-5-5" } as unknown as AI;
const pg = new Playground(db, ai, { canSpend: () => true, everyMs: Number(process.env.EVERY_MS ?? 30_000) });
pg.start();
const app = new Hono();
app.route("/", playgroundRoutes(pg, ["http://localhost:3000", "http://127.0.0.1:3000"]));
serve({ fetch: app.fetch, port: 8790, hostname: "127.0.0.1" }, () => console.log("playground preview (stand-in model) on http://127.0.0.1:8790"));
