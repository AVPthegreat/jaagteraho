"""HTTP handlers for /api/customers."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_customer(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "credit_limit", "since")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_customers(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_customers()]
    return ok(paginate(rows, page, size))


def customer_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/customers"): create_customer,
    ("GET", "/api/customers"): list_customers,
    ("GET", "/api/customers/summary"): customer_summary,
}
