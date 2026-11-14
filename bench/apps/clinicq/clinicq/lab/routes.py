"""HTTP handlers for /api/labs."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_lab(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "price", "hours")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_labs(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_labs()]
    return ok(paginate(rows, page, size))


def lab_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/labs"): create_lab,
    ("GET", "/api/labs"): list_labs,
    ("GET", "/api/labs/summary"): lab_summary,
}
