"""HTTP handlers for /api/sellers."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_seller(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "rating_sum", "joined_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_sellers(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_sellers()]
    return ok(paginate(rows, page, size))


def seller_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/sellers"): create_seller,
    ("GET", "/api/sellers"): list_sellers,
    ("GET", "/api/sellers/summary"): seller_summary,
}
