"""HTTP handlers for /api/reviews."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_review(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "order_id", "stars", "text")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_reviews(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_reviews()]
    return ok(paginate(rows, page, size))


def review_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/reviews"): create_review,
    ("GET", "/api/reviews"): list_reviews,
    ("GET", "/api/reviews/summary"): review_summary,
}
