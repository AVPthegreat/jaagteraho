import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb } from "../src/db/db.js";
import { pasteRoutes } from "../src/web/paste.js";
import { publicRoutes } from "../src/web/public.js";

// Regression tests for the crashes JaagteRaho found in itself on 13 Nov 2026.
const db = openDb(":memory:");
const pub = publicRoutes({ db, voice: null, twinBroken: "http://127.0.0.1:9", twinFixed: "http://127.0.0.1:9", allowedOrigins: [] });
const paste = pasteRoutes(db, null);
const post = (app: { request: typeof pub.request }, path: string, body: string) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("public API refuses bad input without crashing", () => {
  it("break: null body, arrays and inherited property names", async () => {
    for (const body of ["null", "[]", '"x"', '{"session":"aaaaaaaaaa","flow":"__proto__"}', '{"session":"aaaaaaaaaa","flow":"toString"}', '{"session":5,"flow":"submit"}']) {
      assert.equal((await post(pub, "/public/break", body)).status, 400, body);
    }
  });
  it("approve: inherited flow names and bad fix ids", async () => {
    for (const body of ["null", '{"session":"aaaaaaaaaa","flow":"constructor","fix_id":1}', '{"session":"aaaaaaaaaa","flow":"submit","fix_id":"1"}']) {
      assert.equal((await post(pub, "/public/approve", body)).status, 400, body);
    }
  });
  it("sign: non-text name or country", async () => {
    for (const body of ["null", '{"session":"aaaaaaaaaa","name":123,"country":{}}', '{"session":"aaaaaaaaaa","name":["x"],"country":"IN"}']) {
      assert.equal((await post(pub, "/public/sign", body)).status, 400, body);
    }
  });
  it("paste: non-text traceback or repository", async () => {
    for (const body of ["null", '{"session":"aaaaaaaaaa","repo":"https://github.com/a/b","traceback":123}', '{"session":"aaaaaaaaaa","repo":["x"],"traceback":"x"}']) {
      assert.equal((await post(paste, "/public/paste", body)).status, 400, body);
    }
  });
});
