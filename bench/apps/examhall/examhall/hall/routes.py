"""HTTP handlers for /api/halls."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_hall(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "seats")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_halls(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_halls()]
    return ok(paginate(rows, page, size))


def hall_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/halls"): create_hall,
    ("GET", "/api/halls"): list_halls,
    ("GET", "/api/halls/summary"): hall_summary,
}
