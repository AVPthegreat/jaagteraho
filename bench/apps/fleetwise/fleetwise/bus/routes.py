"""HTTP handlers for /api/buses."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_bus(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "plate", "seats", "bought_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_buses(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_buses()]
    return ok(paginate(rows, page, size))


def bus_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/buses"): create_bus,
    ("GET", "/api/buses"): list_buses,
    ("GET", "/api/buses/summary"): bus_summary,
}
