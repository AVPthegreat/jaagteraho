"""HTTP handlers for /api/trips."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_trip(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "bus_id", "route_id", "riders", "ran_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_trips(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_trips()]
    return ok(paginate(rows, page, size))


def trip_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/trips"): create_trip,
    ("GET", "/api/trips"): list_trips,
    ("GET", "/api/trips/summary"): trip_summary,
}
