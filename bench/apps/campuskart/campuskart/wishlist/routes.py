"""HTTP handlers for /api/wishlists."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_wishlist(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "student", "listing_id", "added_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_wishlists(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_wishlists()]
    return ok(paginate(rows, page, size))


def wishlist_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/wishlists"): create_wishlist,
    ("GET", "/api/wishlists"): list_wishlists,
    ("GET", "/api/wishlists/summary"): wishlist_summary,
}
