"""HTTP handlers for /api/meals."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_meal(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "title", "price", "served_on", "plates")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_meals(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_meals()]
    return ok(paginate(rows, page, size))


def meal_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/meals"): create_meal,
    ("GET", "/api/meals"): list_meals,
    ("GET", "/api/meals/summary"): meal_summary,
}
