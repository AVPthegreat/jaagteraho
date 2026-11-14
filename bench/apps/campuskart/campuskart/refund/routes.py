"""HTTP handlers for /api/refunds."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_refund(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "order_id", "amount", "asked_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_refunds(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_refunds()]
    return ok(paginate(rows, page, size))


def refund_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/refunds"): create_refund,
    ("GET", "/api/refunds"): list_refunds,
    ("GET", "/api/refunds/summary"): refund_summary,
}
