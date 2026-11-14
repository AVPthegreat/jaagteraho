# Accuracy on real bugs

Run on 2026-11-14 12:58 UTC with claude-sonnet-5-5. 12 cases from 10 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 12 | 8 (67%) | 4 (33%) | 8 |
| Fault in the traceback | 0 | 0 (-) | 0 (-) | 0 |
| Root cause elsewhere | 12 | 8 (67%) | 4 (33%) | 8 |

Total cost $0.69 (about $0.058 per diagnosis); median 20 s per diagnosis.
Not diagnosed: 0 (none).

How it works: the traceback is parsed as the paste page parses it; frames inside the repository's own packages count as app code; up to 3 repository files from the traceback (plus up to 2 files they import and use) are read at the commit before the fix; Claude proposes the cause and an edit, and may first look up definitions, assignments, search the code or read lines of the repository at that commit (at most 5 rounds).  The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| pallets/click | elsewhere | `src/click/_compat.py:15` | yes | yes | [issue](https://github.com/pallets/click/issues/2355) | [fix](https://github.com/pallets/click/pull/2554) |
| pallets/jinja | elsewhere | `src/jinja2/runtime.py:903` | yes | no | [issue](https://github.com/pallets/jinja/issues/1448) | [fix](https://github.com/pallets/jinja/pull/1455) |
| pallets/jinja | elsewhere | `src/jinja2/compiler.py:1564` | yes | no | [issue](https://github.com/pallets/jinja/issues/1427) | [fix](https://github.com/pallets/jinja/pull/1449) |
| encode/httpx | elsewhere | `httpx/_utils.py:314` | yes | yes | [issue](https://github.com/encode/httpx/issues/1082) | [fix](https://github.com/encode/httpx/pull/1120) |
| encode/httpx | elsewhere | `httpx/_models.py:651` | yes | yes | [issue](https://github.com/encode/httpx/issues/1203) | [fix](https://github.com/encode/httpx/pull/1205) |
| python-attrs/attrs | elsewhere | `src/attr/_make.py:8` | yes | no | [issue](https://github.com/python-attrs/attrs/issues/781) | [fix](https://github.com/python-attrs/attrs/pull/782) |
| pytest-dev/pytest | elsewhere | `src/_pytest/assertion/rewrite.py:200` | no | no | [issue](https://github.com/pytest-dev/pytest/issues/11417) | [fix](https://github.com/pytest-dev/pytest/pull/11420) |
| Textualize/rich | elsewhere | `rich/text.py:1142` | yes | no | [issue](https://github.com/Textualize/rich/issues/3014) | [fix](https://github.com/Textualize/rich/pull/3471) |
| python-attrs/cattrs | elsewhere | `src/cattrs/gen/__init__.py:847` | no | no | [issue](https://github.com/python-attrs/cattrs/issues/721) | [fix](https://github.com/python-attrs/cattrs/pull/722) |
| marshmallow-code/marshmallow | elsewhere | `src/marshmallow/schema.py:100` | yes | yes | [issue](https://github.com/marshmallow-code/marshmallow/issues/1837) | [fix](https://github.com/marshmallow-code/marshmallow/pull/1843) |
| celery/celery | elsewhere | `celery/backends/base.py:266` | no | no | [issue](https://github.com/celery/celery/issues/6766) | [fix](https://github.com/celery/celery/pull/10385) |
| psf/black | elsewhere | `src/black/linegen.py:419` | no | no | [issue](https://github.com/psf/black/issues/4625) | [fix](https://github.com/psf/black/pull/4628) |
