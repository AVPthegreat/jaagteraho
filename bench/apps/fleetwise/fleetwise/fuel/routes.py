"""HTTP handlers for /api/fuels."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_fuel(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "bus_id", "litres", "cost", "filled_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_fuels(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_fuels()]
    return ok(paginate(rows, page, size))


def fuel_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/fuels"): create_fuel,
    ("GET", "/api/fuels"): list_fuels,
    ("GET", "/api/fuels/summary"): fuel_summary,
}
