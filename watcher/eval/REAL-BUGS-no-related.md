# Accuracy on real bugs

Run on 2026-11-13 10:41 UTC with claude-sonnet-5-5. 30 cases from 17 public Python projects; each is a traceback a user posted on GitHub, scored against the lines the real, merged fix changed.

| Cases | Diagnosed | Right file | Right lines (±3) | Fix passed code checks |
|---|---|---|---|---|
| All | 29 | 22 (76%) | 16 (55%) | 21 |
| Fault in the traceback | 20 | 20 (100%) | 16 (80%) | 16 |
| Root cause elsewhere | 9 | 2 (22%) | 0 (0%) | 5 |

Total cost $0.84 (about $0.029 per diagnosis); median 8 s per diagnosis.
Not diagnosed: 1 (psf/black: no repository files found from the traceback).

How it works: the traceback is parsed as the paste page parses it; up to 3 repository files from the traceback are read at the commit before the fix; one Claude call proposes the cause and an edit. The model never sees the real fix. 'Right lines' means the named line, or the text the edit replaces, is within 3 lines of a line the real fix changed. The fix-review step is skipped here to save cost.

| Repository | Kind | Named | Right file | Right lines | Issue | Real fix |
|---|---|---|---|---|---|---|
| pallets/click | in trace | `src/click/utils.py:333` | yes | no | [issue](https://github.com/pallets/click/issues/3487) | [fix](https://github.com/pallets/click/pull/3493) |
| pallets/werkzeug | in trace | `werkzeug/urls.py:983` | yes | yes | [issue](https://github.com/pallets/werkzeug/issues/2708) | [fix](https://github.com/pallets/werkzeug/pull/2709) |
| pallets/werkzeug | in trace | `werkzeug/http.py:371` | yes | no | [issue](https://github.com/pallets/werkzeug/issues/2955) | [fix](https://github.com/pallets/werkzeug/pull/2956) |
| pallets/click | in trace | `click/utils.py:268` | yes | yes | [issue](https://github.com/pallets/click/issues/2415) | [fix](https://github.com/pallets/click/pull/2555) |
| pallets/jinja | in trace | `jinja2/loaders.py:31` | yes | yes | [issue](https://github.com/pallets/jinja/issues/1697) | [fix](https://github.com/pallets/jinja/pull/1698) |
| pydantic/pydantic | in trace | `pydantic/_internal/_docs_extraction.py:100` | yes | yes | [issue](https://github.com/pydantic/pydantic/issues/13870) | [fix](https://github.com/pydantic/pydantic/pull/13874) |
| celery/celery | in trace | `celery/worker/control.py:371` | yes | yes | [issue](https://github.com/celery/celery/issues/9489) | [fix](https://github.com/celery/celery/pull/10295) |
| pypa/pip | in trace | `pip/_internal/req/constructors.py:226` | yes | no | [issue](https://github.com/pypa/pip/issues/6385) | [fix](https://github.com/pypa/pip/pull/14135) |
| celery/celery | in trace | `celery/backends/redis.py:399` | yes | yes | [issue](https://github.com/celery/celery/issues/10312) | [fix](https://github.com/celery/celery/pull/10313) |
| celery/celery | in trace | `celery/concurrency/asynpool.py:1484` | yes | yes | [issue](https://github.com/celery/celery/issues/10858) | [fix](https://github.com/celery/celery/pull/10861) |
| scrapy/scrapy | in trace | `scrapy/http/response/text.py:89` | yes | yes | [issue](https://github.com/scrapy/scrapy/issues/6456) | [fix](https://github.com/scrapy/scrapy/pull/7897) |
| scrapy/scrapy | in trace | `scrapy/utils/project.py:126` | yes | no | [issue](https://github.com/scrapy/scrapy/issues/4780) | [fix](https://github.com/scrapy/scrapy/pull/8042) |
| Textualize/rich | in trace | `rich/__init__.py:16` | yes | yes | [issue](https://github.com/Textualize/rich/issues/2197) | [fix](https://github.com/Textualize/rich/pull/2212) |
| Textualize/rich | in trace | `rich/markdown.py:262` | yes | yes | [issue](https://github.com/Textualize/rich/issues/3053) | [fix](https://github.com/Textualize/rich/pull/3064) |
| psf/black | in trace | `src/black/linegen.py:465` | yes | yes | [issue](https://github.com/psf/black/issues/4781) | [fix](https://github.com/psf/black/pull/4854) |
| psf/black | in trace | `src/black/__init__.py:703` | yes | yes | [issue](https://github.com/psf/black/issues/4077) | [fix](https://github.com/psf/black/pull/4161) |
| aio-libs/aiohttp | in trace | `aiohttp/multipart.py:388` | yes | yes | [issue](https://github.com/aio-libs/aiohttp/issues/13758) | [fix](https://github.com/aio-libs/aiohttp/pull/13760) |
| marshmallow-code/marshmallow | in trace | `marshmallow/fields.py:1117` | yes | yes | [issue](https://github.com/marshmallow-code/marshmallow/issues/1357) | [fix](https://github.com/marshmallow-code/marshmallow/pull/1359) |
| pytest-dev/pytest | in trace | `_pytest/_code/code.py:1196` | yes | yes | [issue](https://github.com/pytest-dev/pytest/issues/13734) | [fix](https://github.com/pytest-dev/pytest/pull/14025) |
| pytest-dev/pytest | in trace | `_pytest/terminal.py:737` | yes | yes | [issue](https://github.com/pytest-dev/pytest/issues/13478) | [fix](https://github.com/pytest-dev/pytest/pull/13573) |
| pallets/flask | elsewhere | `flask/helpers.py:222` | no | no | [issue](https://github.com/pallets/flask/issues/5258) | [fix](https://github.com/pallets/flask/pull/5264) |
| psf/requests | elsewhere | `requests/adapters.py:520` | yes | no | [issue](https://github.com/psf/requests/issues/6643) | [fix](https://github.com/psf/requests/pull/6644) |
| pallets/jinja | elsewhere | `jinja2/nativetypes.py:25` | no | no | [issue](https://github.com/pallets/jinja/issues/1701) | [fix](https://github.com/pallets/jinja/pull/1702) |
| encode/httpx | elsewhere | `httpx/dispatch/http11.py:108` | no | no | [issue](https://github.com/encode/httpx/issues/309) | [fix](https://github.com/encode/httpx/pull/310) |
| psf/black | elsewhere | `src/black/parsing.py:140` | no | no | [issue](https://github.com/psf/black/issues/4062) | [fix](https://github.com/psf/black/pull/4086) |
| fastapi/fastapi | elsewhere | `fastapi/routing.py:474` | no | no | [issue](https://github.com/fastapi/fastapi/issues/9424) | [fix](https://github.com/fastapi/fastapi/pull/9425) |
| marshmallow-code/marshmallow | elsewhere | `marshmallow/schema.py:938` | no | no | [issue](https://github.com/marshmallow-code/marshmallow/issues/2868) | [fix](https://github.com/marshmallow-code/marshmallow/pull/2894) |
| celery/celery | elsewhere | `celery/backends/redis.py:197` | no | no | [issue](https://github.com/celery/celery/issues/6164) | [fix](https://github.com/celery/celery/pull/10406) |
| python-attrs/attrs | elsewhere | `attr/_make.py:317` | yes | no | [issue](https://github.com/python-attrs/attrs/issues/1284) | [fix](https://github.com/python-attrs/attrs/pull/1319) |
