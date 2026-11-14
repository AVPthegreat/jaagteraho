"""HTTP handlers for /api/listings."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_listing(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "seller_id", "title", "price", "listed_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_listings(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_listings()]
    return ok(paginate(rows, page, size))


def listing_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/listings"): create_listing,
    ("GET", "/api/listings"): list_listings,
    ("GET", "/api/listings/summary"): listing_summary,
}
