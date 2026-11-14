"""HTTP handlers for /api/coupons."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_coupon(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "code", "discount_rate", "valid_until")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_coupons(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_coupons()]
    return ok(paginate(rows, page, size))


def coupon_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/coupons"): create_coupon,
    ("GET", "/api/coupons"): list_coupons,
    ("GET", "/api/coupons/summary"): coupon_summary,
}
