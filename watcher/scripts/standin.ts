// A STAND-IN for Claude, for local previews and dry runs: no API key, no spend, no network. It answers the
// decision questions, proposes a correct fix only for messmenu's missing-plates bug ("no edit" otherwise),
// and approves fixes in review. Never used in production.

import { SpendGuard, type AI } from "../src/ai/claude.js";
import type { DB } from "../src/db/db.js";

export function standInAI(db: DB): AI {
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
  return { client, guard: new SpendGuard(db, 40, 45), decisionModel: "claude-haiku-5-5", diagnosisModel: "claude-sonnet-5-5" } as unknown as AI;
}
