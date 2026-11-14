"""HTTP handlers for /api/invoices."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_invoice(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "customer_id", "amount", "gst_rate", "issued_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_invoices(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_invoices()]
    return ok(paginate(rows, page, size))


def invoice_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/invoices"): create_invoice,
    ("GET", "/api/invoices"): list_invoices,
    ("GET", "/api/invoices/summary"): invoice_summary,
}
