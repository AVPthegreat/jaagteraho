"""HTTP handlers for /api/payments."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_payment(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "student_id", "amount", "paid_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_payments(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_payments()]
    return ok(paginate(rows, page, size))


def payment_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/payments"): create_payment,
    ("GET", "/api/payments"): list_payments,
    ("GET", "/api/payments/summary"): payment_summary,
}
