"""HTTP handlers for /api/payouts."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_payout(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "seller_id", "amount", "paid_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_payouts(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_payouts()]
    return ok(paginate(rows, page, size))


def payout_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/payouts"): create_payout,
    ("GET", "/api/payouts"): list_payouts,
    ("GET", "/api/payouts/summary"): payout_summary,
}
