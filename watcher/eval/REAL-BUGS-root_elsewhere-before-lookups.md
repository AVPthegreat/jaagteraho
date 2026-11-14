# Accuracy on real bugs

Run on 2026-11-13 11:02 UTC with claude-sonnet-5-5. 10 cases from 9 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 9 | 3 (33%) | 0 (0%) | 4 |
| Fault in the traceback | 0 | 0 (-) | 0 (-) | 0 |
| Root cause elsewhere | 9 | 3 (33%) | 0 (0%) | 4 |

Total cost $0.38 (about $0.042 per diagnosis); median 10 s per diagnosis.
Not diagnosed: 1 (psf/black: no repository files found from the traceback).

How it works: the traceback is parsed as the paste page parses it; up to 3 repository files from the traceback are read at the commit before the fix; one Claude call proposes the cause and an edit. The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| pallets/flask | elsewhere | `flask/helpers.py:222` | no | no | [issue](https://github.com/pallets/flask/issues/5258) | [fix](https://github.com/pallets/flask/pull/5264) |
| pallets/jinja | elsewhere | `jinja2/nativetypes.py:35` | no | no | [issue](https://github.com/pallets/jinja/issues/1701) | [fix](https://github.com/pallets/jinja/pull/1702) |
| psf/requests | elsewhere | `requests/adapters.py:534` | yes | no | [issue](https://github.com/psf/requests/issues/6643) | [fix](https://github.com/psf/requests/pull/6644) |
| encode/httpx | elsewhere | `httpx/client.py:202` | no | no | [issue](https://github.com/encode/httpx/issues/309) | [fix](https://github.com/encode/httpx/pull/310) |
| psf/black | elsewhere | `src/black/__init__.py:1447` | no | no | [issue](https://github.com/psf/black/issues/4062) | [fix](https://github.com/psf/black/pull/4086) |
| fastapi/fastapi | elsewhere | `fastapi/routing.py:477` | no | no | [issue](https://github.com/fastapi/fastapi/issues/9424) | [fix](https://github.com/fastapi/fastapi/pull/9425) |
| marshmallow-code/marshmallow | elsewhere | `marshmallow/schema.py:938` | no | no | [issue](https://github.com/marshmallow-code/marshmallow/issues/2868) | [fix](https://github.com/marshmallow-code/marshmallow/pull/2894) |
| celery/celery | elsewhere | `celery/backends/base.py:753` | yes | no | [issue](https://github.com/celery/celery/issues/6164) | [fix](https://github.com/celery/celery/pull/10406) |
| python-attrs/attrs | elsewhere | `attr/_make.py:317` | yes | no | [issue](https://github.com/python-attrs/attrs/issues/1284) | [fix](https://github.com/python-attrs/attrs/pull/1319) |
