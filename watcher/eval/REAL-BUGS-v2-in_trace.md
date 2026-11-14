# Accuracy on real bugs

Run on 2026-11-14 12:59 UTC with claude-sonnet-5-5. 20 cases from 12 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 20 | 20 (100%) | 17 (85%) | 19 |
| Fault in the traceback | 20 | 20 (100%) | 17 (85%) | 19 |
| Root cause elsewhere | 0 | 0 (-) | 0 (-) | 0 |

Total cost $0.79 (about $0.039 per diagnosis); median 7 s per diagnosis.
Not diagnosed: 0 (none).

How it works: the traceback is parsed as the paste page parses it; frames inside the repository's own packages count as app code; up to 3 repository files from the traceback (plus up to 2 files they import and use) are read at the commit before the fix; Claude proposes the cause and an edit, and may first look up definitions, assignments, search the code or read lines of the repository at that commit (at most 5 rounds).  The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| pallets/werkzeug | in trace | `src/werkzeug/urls.py:983` | yes | yes | [issue](https://github.com/pallets/werkzeug/issues/2708) | [fix](https://github.com/pallets/werkzeug/pull/2709) |
| pallets/werkzeug | in trace | `src/werkzeug/http.py:371` | yes | no | [issue](https://github.com/pallets/werkzeug/issues/2955) | [fix](https://github.com/pallets/werkzeug/pull/2956) |
| pallets/click | in trace | `src/click/utils.py:268` | yes | yes | [issue](https://github.com/pallets/click/issues/2415) | [fix](https://github.com/pallets/click/pull/2555) |
| pallets/click | in trace | `src/click/utils.py:333` | yes | no | [issue](https://github.com/pallets/click/issues/3487) | [fix](https://github.com/pallets/click/pull/3493) |
| pydantic/pydantic | in trace | `pydantic/_internal/_docs_extraction.py:100` | yes | yes | [issue](https://github.com/pydantic/pydantic/issues/13870) | [fix](https://github.com/pydantic/pydantic/pull/13874) |
| pallets/jinja | in trace | `src/jinja2/loaders.py:31` | yes | yes | [issue](https://github.com/pallets/jinja/issues/1697) | [fix](https://github.com/pallets/jinja/pull/1698) |
| celery/celery | in trace | `celery/worker/control.py:371` | yes | yes | [issue](https://github.com/celery/celery/issues/9489) | [fix](https://github.com/celery/celery/pull/10295) |
| pypa/pip | in trace | `src/pip/_internal/req/constructors.py:356` | yes | yes | [issue](https://github.com/pypa/pip/issues/6385) | [fix](https://github.com/pypa/pip/pull/14135) |
| celery/celery | in trace | `celery/concurrency/asynpool.py:1484` | yes | yes | [issue](https://github.com/celery/celery/issues/10858) | [fix](https://github.com/celery/celery/pull/10861) |
| celery/celery | in trace | `celery/backends/redis.py:399` | yes | yes | [issue](https://github.com/celery/celery/issues/10312) | [fix](https://github.com/celery/celery/pull/10313) |
| scrapy/scrapy | in trace | `scrapy/http/response/text.py:89` | yes | yes | [issue](https://github.com/scrapy/scrapy/issues/6456) | [fix](https://github.com/scrapy/scrapy/pull/7897) |
| Textualize/rich | in trace | `rich/markdown.py:262` | yes | yes | [issue](https://github.com/Textualize/rich/issues/3053) | [fix](https://github.com/Textualize/rich/pull/3064) |
| Textualize/rich | in trace | `rich/__init__.py:16` | yes | yes | [issue](https://github.com/Textualize/rich/issues/2197) | [fix](https://github.com/Textualize/rich/pull/2212) |
| scrapy/scrapy | in trace | `scrapy/utils/project.py:126` | yes | no | [issue](https://github.com/scrapy/scrapy/issues/4780) | [fix](https://github.com/scrapy/scrapy/pull/8042) |
| psf/black | in trace | `src/black/linegen.py:465` | yes | yes | [issue](https://github.com/psf/black/issues/4781) | [fix](https://github.com/psf/black/pull/4854) |
| aio-libs/aiohttp | in trace | `aiohttp/multipart.py:388` | yes | yes | [issue](https://github.com/aio-libs/aiohttp/issues/13758) | [fix](https://github.com/aio-libs/aiohttp/pull/13760) |
| psf/black | in trace | `src/black/__init__.py:703` | yes | yes | [issue](https://github.com/psf/black/issues/4077) | [fix](https://github.com/psf/black/pull/4161) |
| marshmallow-code/marshmallow | in trace | `src/marshmallow/fields.py:1115` | yes | yes | [issue](https://github.com/marshmallow-code/marshmallow/issues/1357) | [fix](https://github.com/marshmallow-code/marshmallow/pull/1359) |
| pytest-dev/pytest | in trace | `src/_pytest/_code/code.py:1196` | yes | yes | [issue](https://github.com/pytest-dev/pytest/issues/13734) | [fix](https://github.com/pytest-dev/pytest/pull/14025) |
| pytest-dev/pytest | in trace | `src/_pytest/terminal.py:737` | yes | yes | [issue](https://github.com/pytest-dev/pytest/issues/13478) | [fix](https://github.com/pytest-dev/pytest/pull/13573) |
