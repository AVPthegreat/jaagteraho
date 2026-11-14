// One hop beyond the stack trace: imported files that the failing functions actually use.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { candidates, enclosingFunction, parseImports, relatedFiles } from "../src/source/related.js";
import { LocalSource } from "../src/source/source.js";

const ROOT = fileURLToPath(new URL("../../bench/apps/fleetwise", import.meta.url));
const file = (p: string, line: number) => ({ path: p, text: readFileSync(`${ROOT}/${p}`, "utf8"), focus: [line] });

describe("related files", () => {
  it("adds the shared helper that the failing route uses, even though it is not in the stack", async () => {
    // The empty-date bug: crash in service.create -> dates.parse_date; the cause is http.require_fields.
    const routes = file("fleetwise/trip/routes.py", 14);
    const service = file("fleetwise/trip/service.py", 17);
    const dates = file("fleetwise/core/dates.py", 9);
    const related = await relatedFiles(new LocalSource(ROOT), [routes, service, dates]);
    assert.ok(related.some((r) => r.path === "fleetwise/core/http.py"), JSON.stringify(related.map((r) => r.path)));
    assert.ok(related.length <= 2);
    assert.ok(!related.some((r) => r.path === "fleetwise/core/dates.py"), "already shown");
  });

  it("only counts imports the failing function uses", () => {
    const text = "from .a import used, unused\nimport os\n\n\ndef f(x):\n    return used(x)\n\n\ndef g():\n    return unused()\n";
    const body = enclosingFunction(text, 6).join("\n");
    assert.match(body, /def f/);
    assert.doesNotMatch(body, /def g/);
    assert.deepEqual(parseImports(text)[0], { names: ["used", "unused"], module: "a", level: 1, js: false });
  });

  it("resolves Python and JavaScript import paths", () => {
    assert.deepEqual(candidates("src/flask/helpers.py", { names: ["x"], module: "globals", level: 1, js: false }), ["src/flask/globals.py", "src/flask/globals/__init__.py"]);
    assert.deepEqual(candidates("pkg/core/x.py", { names: ["x"], module: "store", level: 2, js: false }), ["pkg/store.py", "pkg/store/__init__.py"]);
    assert.equal(candidates("app/src/users.ts", { names: ["x"], module: "../lib/db", level: 0, js: true })[0], "app/lib/db.ts");
    assert.deepEqual(parseImports('import { getUser, type User } from "./users";')[0].names, ["getUser", "User"]);
    assert.deepEqual(parseImports('const { save } = require("../db");')[0], { names: ["save"], module: "../db", level: 0, js: true });
  });
});
