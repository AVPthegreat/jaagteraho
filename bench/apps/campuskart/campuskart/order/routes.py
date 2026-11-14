"""HTTP handlers for /api/orders."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_order(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "listing_id", "quantity", "total", "placed_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_orders(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_orders()]
    return ok(paginate(rows, page, size))


def order_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/orders"): create_order,
    ("GET", "/api/orders"): list_orders,
    ("GET", "/api/orders/summary"): order_summary,
}
