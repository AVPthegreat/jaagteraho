"""HTTP handlers for /api/medicines."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_medicine(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "price", "stock")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_medicines(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_medicines()]
    return ok(paginate(rows, page, size))


def medicine_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/medicines"): create_medicine,
    ("GET", "/api/medicines"): list_medicines,
    ("GET", "/api/medicines/summary"): medicine_summary,
}
