"""HTTP handlers for /api/expenses."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_expense(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "label", "amount", "spent_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_expenses(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_expenses()]
    return ok(paginate(rows, page, size))


def expense_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/expenses"): create_expense,
    ("GET", "/api/expenses"): list_expenses,
    ("GET", "/api/expenses/summary"): expense_summary,
}
