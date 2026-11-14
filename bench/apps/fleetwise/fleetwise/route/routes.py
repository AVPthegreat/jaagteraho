"""HTTP handlers for /api/routes."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_route(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "km", "fare")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_routes(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_routes()]
    return ok(paginate(rows, page, size))


def route_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/routes"): create_route,
    ("GET", "/api/routes"): list_routes,
    ("GET", "/api/routes/summary"): route_summary,
}
