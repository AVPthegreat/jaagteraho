# Accuracy on real bugs

Run on 2026-11-14 13:02 UTC with claude-sonnet-5-5. 5 cases from 5 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 5 | 1 (20%) | 0 (0%) | 3 |
| Fault in the traceback | 0 | 0 (-) | 0 (-) | 0 |
| Root cause elsewhere | 5 | 1 (20%) | 0 (0%) | 3 |

Total cost $0.17 (about $0.035 per diagnosis); median 25 s per diagnosis.
Not diagnosed: 0 (none).

How it works: the traceback is parsed as the paste page parses it; frames inside the repository's own packages count as app code; up to 3 repository files from the traceback (plus up to 2 files they import and use) are read at the commit before the fix; Claude proposes the cause and an edit, and may first look up definitions, assignments, search the code or read lines of the repository at that commit (at most 5 rounds).  The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| psf/black | elsewhere | `src/black/__init__.py:1444` | no | no | [issue](https://github.com/psf/black/issues/4062) | [fix](https://github.com/psf/black/pull/4086) |
| pallets/jinja | elsewhere | `src/jinja2/compiler.py:1448` | no | no | [issue](https://github.com/pallets/jinja/issues/1701) | [fix](https://github.com/pallets/jinja/pull/1702) |
| marshmallow-code/marshmallow | elsewhere | `src/marshmallow/fields.py:300` | yes | no | [issue](https://github.com/marshmallow-code/marshmallow/issues/2868) | [fix](https://github.com/marshmallow-code/marshmallow/pull/2894) |
| psf/requests | elsewhere | `src/requests/models.py:93` | no | no | [issue](https://github.com/psf/requests/issues/6643) | [fix](https://github.com/psf/requests/pull/6644) |
| celery/celery | elsewhere | `celery/result.py:444` | no | no | [issue](https://github.com/celery/celery/issues/6164) | [fix](https://github.com/celery/celery/pull/10406) |
