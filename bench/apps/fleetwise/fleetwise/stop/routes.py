"""HTTP handlers for /api/stops."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_stop(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "route_id", "order")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_stops(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_stops()]
    return ok(paginate(rows, page, size))


def stop_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/stops"): create_stop,
    ("GET", "/api/stops"): list_stops,
    ("GET", "/api/stops/summary"): stop_summary,
}
