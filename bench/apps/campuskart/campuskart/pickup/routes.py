"""HTTP handlers for /api/pickups."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_pickup(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "order_id", "spot", "at")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_pickups(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_pickups()]
    return ok(paginate(rows, page, size))


def pickup_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/pickups"): create_pickup,
    ("GET", "/api/pickups"): list_pickups,
    ("GET", "/api/pickups/summary"): pickup_summary,
}
