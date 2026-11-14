# Accuracy on real bugs

Run on 2026-11-14 12:53 UTC with claude-sonnet-5-5. 5 cases from 5 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 5 | 3 (60%) | 3 (60%) | 5 |
| Fault in the traceback | 0 | 0 (-) | 0 (-) | 0 |
| Root cause elsewhere | 5 | 3 (60%) | 3 (60%) | 5 |

Total cost $0.20 (about $0.041 per diagnosis); median 20 s per diagnosis.
Not diagnosed: 0 (none).

How it works: the traceback is parsed as the paste page parses it; frames inside the repository's own packages count as app code; up to 3 repository files from the traceback (plus up to 2 files they import and use) are read at the commit before the fix; Claude proposes the cause and an edit, and may first look up definitions, assignments, search the code or read lines of the repository at that commit (at most 5 rounds).  The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| fastapi/fastapi | elsewhere | `fastapi/routing.py:477` | no | no | [issue](https://github.com/fastapi/fastapi/issues/9424) | [fix](https://github.com/fastapi/fastapi/pull/9425) |
| pallets/flask | elsewhere | `src/flask/app.py:954` | yes | yes | [issue](https://github.com/pallets/flask/issues/5258) | [fix](https://github.com/pallets/flask/pull/5264) |
| encode/httpx | elsewhere | `httpx/middleware.py:91` | yes | yes | [issue](https://github.com/encode/httpx/issues/309) | [fix](https://github.com/encode/httpx/pull/310) |
| python-attrs/attrs | elsewhere | `src/attr/_make.py:2209` | yes | yes | [issue](https://github.com/python-attrs/attrs/issues/1284) | [fix](https://github.com/python-attrs/attrs/pull/1319) |
| psf/black | elsewhere | `src/black/lines.py:1401` | no | no | [issue](https://github.com/psf/black/issues/5214) | [fix](https://github.com/psf/black/pull/5414) |
