"""HTTP handlers for /api/offers."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_offer(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "listing_id", "amount", "made_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_offers(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_offers()]
    return ok(paginate(rows, page, size))


def offer_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/offers"): create_offer,
    ("GET", "/api/offers"): list_offers,
    ("GET", "/api/offers/summary"): offer_summary,
}
