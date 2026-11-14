# Accuracy on real bugs

Run on 2026-11-14 11:31 UTC with claude-sonnet-5-5. 10 cases from 9 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 10 | 6 (60%) | 4 (40%) | 5 |
| Fault in the traceback | 0 | 0 (-) | 0 (-) | 0 |
| Root cause elsewhere | 10 | 6 (60%) | 4 (40%) | 5 |

Total cost $0.26 (about $0.026 per diagnosis); median 16 s per diagnosis.
Not diagnosed: 0 (none).

How it works: the traceback is parsed as the paste page parses it; frames inside the repository's own packages count as app code; up to 3 repository files from the traceback (plus up to 2 files they import and use) are read at the commit before the fix; Claude proposes the cause and an edit, and may first look up definitions, search the code or read lines of the repository at that commit (at most 2 rounds).  The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| pallets/flask | elsewhere | `src/flask/app.py:954` | yes | yes | [issue](https://github.com/pallets/flask/issues/5258) | [fix](https://github.com/pallets/flask/pull/5264) |
| psf/requests | elsewhere | `src/requests/adapters.py:534` | yes | no | [issue](https://github.com/psf/requests/issues/6643) | [fix](https://github.com/psf/requests/pull/6644) |
| pallets/jinja | elsewhere | `src/jinja2/nativetypes.py:25` | no | no | [issue](https://github.com/pallets/jinja/issues/1701) | [fix](https://github.com/pallets/jinja/pull/1702) |
| encode/httpx | elsewhere | `httpx/middleware.py:92` | yes | yes | [issue](https://github.com/encode/httpx/issues/309) | [fix](https://github.com/encode/httpx/pull/310) |
| fastapi/fastapi | elsewhere | `fastapi/routing.py:474` | no | no | [issue](https://github.com/fastapi/fastapi/issues/9424) | [fix](https://github.com/fastapi/fastapi/pull/9425) |
| psf/black | elsewhere | `src/black/__init__.py:1444` | no | no | [issue](https://github.com/psf/black/issues/4062) | [fix](https://github.com/psf/black/pull/4086) |
| marshmallow-code/marshmallow | elsewhere | `src/marshmallow/fields.py:299` | yes | no | [issue](https://github.com/marshmallow-code/marshmallow/issues/2868) | [fix](https://github.com/marshmallow-code/marshmallow/pull/2894) |
| psf/black | elsewhere | `src/black/lines.py:1404` | no | no | [issue](https://github.com/psf/black/issues/5214) | [fix](https://github.com/psf/black/pull/5414) |
| python-attrs/attrs | elsewhere | `src/attr/_make.py:2210` | yes | yes | [issue](https://github.com/python-attrs/attrs/issues/1284) | [fix](https://github.com/python-attrs/attrs/pull/1319) |
| celery/celery | elsewhere | `celery/backends/base.py:1042` | yes | yes | [issue](https://github.com/celery/celery/issues/6164) | [fix](https://github.com/celery/celery/pull/10406) |
