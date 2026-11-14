"""HTTP handlers for /api/bills."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_bill(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "appointment_id", "amount", "discount_rate")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_bills(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_bills()]
    return ok(paginate(rows, page, size))


def bill_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/bills"): create_bill,
    ("GET", "/api/bills"): list_bills,
    ("GET", "/api/bills/summary"): bill_summary,
}
