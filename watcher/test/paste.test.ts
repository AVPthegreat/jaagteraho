import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePythonTraceback, parseRepo } from "../src/web/paste.js";

const TB = `Traceback (most recent call last):
  File "/usr/lib/python3.12/site-packages/django/core/handlers/exception.py", line 55, in inner
    response = get_response(request)
  File "/app/shop/views.py", line 42, in checkout
    total = cart_total(request.user.email, items)
  File "/app/shop/pricing.py", line 9, in cart_total
    return sum(i["price"] for i in items) / len(items)
ZeroDivisionError: division by zero`;

describe("paste: traceback parsing", () => {
  it("reads frames, marks library frames, and keeps the error line", () => {
    const p = parsePythonTraceback(TB)!;
    assert.equal(p.exception_type, "ZeroDivisionError");
    assert.equal(p.message, "division by zero");
    assert.equal(p.frames.length, 3);
    assert.equal(p.frames[0].in_app, false);
    assert.equal(p.frames[2].abs_path, "/app/shop/pricing.py");
    assert.equal(p.frames[2].lineno, 9);
  });
  it("rejects text that is not a traceback", () => {
    assert.equal(parsePythonTraceback("hello world"), null);
  });
  it("accepts only GitHub repository links", () => {
    assert.equal(parseRepo("https://github.com/AVPthegreat/jaagteraho"), "AVPthegreat/jaagteraho");
    assert.equal(parseRepo("github.com/a/b.git"), "a/b");
    assert.equal(parseRepo("https://gitlab.com/a/b"), null);
    assert.equal(parseRepo("https://github.com/a/b/../../evil"), null);
  });
});

import { numbered } from "../src/pipeline/diagnose.js";

describe("diagnosis input: long files", () => {
  it("shows the top of the file and a window around the reported line", () => {
    const text = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`).join("\n");
    const out = numbered(text, [1120]);
    assert.ok(out.includes(" 1120| line 1120"));
    assert.ok(out.includes("    1| line 1"));
    assert.ok(!out.includes(" 600| line 600"));
    assert.ok(out.includes("lines not shown"));
  });
  it("shows short files whole", () => {
    const text = "a\nb\nc";
    assert.equal(numbered(text, [2]).split("\n").length, 3);
  });
});

import { parseJsStack, parseTraceback } from "../src/web/paste.js";

describe("paste: JavaScript stack traces", () => {
  it("reads a Node.js stack", () => {
    const p = parseJsStack(`TypeError: Cannot read properties of undefined (reading 'map')
    at renderList (/var/task/src/lib/list.ts:12:20)
    at handler (/var/task/src/app/api/items/route.ts:8:10)
    at /var/task/node_modules/next/dist/server.js:1:1`)!;
    assert.equal(p.exception_type, "TypeError");
    assert.equal(p.frames.at(-1)!.function, "renderList");
    assert.equal(p.frames.at(-1)!.in_app, true);
    assert.equal(p.frames[0].in_app, false);
  });
  it("reads a browser stack with webpack paths", () => {
    const p = parseTraceback(`Uncaught ReferenceError: user is not defined
    at Profile (webpack:///./src/components/Profile.tsx:21:5)
    at renderWithHooks (https://app.example.com/_next/static/chunks/framework.js:1:2)`)!;
    assert.equal(p.exception_type, "ReferenceError");
    assert.equal(p.frames.at(-1)!.abs_path, "src/components/Profile.tsx");
    assert.equal(p.frames[0].in_app, false);
  });
  it("still prefers Python when it is a Python traceback", () => {
    assert.equal(parseTraceback('Traceback (most recent call last):\n  File "/app/a.py", line 1, in f\n    x()\nNameError: x')!.exception_type, "NameError");
  });
});

describe("paste: other Python traceback styles", () => {
  it("reads IPython / Jupyter tracebacks", () => {
    const t = [
      "IndexError                                Traceback (most recent call last)",
      "Cell In[2], line 1",
      '----> 1 Authorization.from_header("Digest =foo")',
      "",
      "File ~/venv/lib/python3.12/site-packages/werkzeug/http.py:371, in parse_dict_header(value)",
      "    369 encoding = None",
      '--> 371 if key[-1] == "*":',
      "    372     key = key[:-1]",
      "",
      "IndexError: string index out of range",
    ].join("\n");
    const p = parsePythonTraceback(t)!;
    assert.equal(p.exception_type, "IndexError");
    assert.equal(p.frames.length, 1);
    assert.equal(p.frames[0].lineno, 371);
    assert.equal(p.frames[0].function, "parse_dict_header");
    assert.equal(p.frames[0].context_line, 'if key[-1] == "*":');
  });

  it("reads pytest INTERNALERROR tracebacks", () => {
    const t = 'INTERNALERROR> Traceback (most recent call last):\nINTERNALERROR>   File "/x/_pytest/main.py", line 283, in wrap_session\nINTERNALERROR>     session.exitstatus = doit(config, session) or 0\nINTERNALERROR> KeyError: 5';
    const p = parsePythonTraceback(t)!;
    assert.equal(p.exception_type, "KeyError");
    assert.equal(p.frames[0].lineno, 283);
  });
});
