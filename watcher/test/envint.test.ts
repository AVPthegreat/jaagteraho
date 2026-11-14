import { test } from "node:test";
import assert from "node:assert/strict";
import { envInt } from "../src/envint.js";

test("envInt: default when missing, empty, not a whole number or out of range; value otherwise", () => {
  assert.equal(envInt("X", 15, 0, 1000, {}), 15);
  assert.equal(envInt("X", 15, 0, 1000, { X: "" }), 15);
  assert.equal(envInt("X", 15, 0, 1000, { X: "abc" }), 15);
  assert.equal(envInt("X", 15, 0, 1000, { X: "2.5" }), 15);
  assert.equal(envInt("X", 15, 0, 1000, { X: "5000" }), 15);
  assert.equal(envInt("X", 15, 0, 1000, { X: "-1" }), 15);
  assert.equal(envInt("X", 15, 0, 1000, { X: "100" }), 100);
});
