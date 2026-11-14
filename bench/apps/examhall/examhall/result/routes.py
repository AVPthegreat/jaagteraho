"""HTTP handlers for /api/results."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_result(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "attempt_id", "marks", "percent")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_results(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_results()]
    return ok(paginate(rows, page, size))


def result_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/results"): create_result,
    ("GET", "/api/results"): list_results,
    ("GET", "/api/results/summary"): result_summary,
}
