"""HTTP handlers for /api/feedbacks."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_feedback(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "exam_id", "stars", "text")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_feedbacks(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_feedbacks()]
    return ok(paginate(rows, page, size))


def feedback_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/feedbacks"): create_feedback,
    ("GET", "/api/feedbacks"): list_feedbacks,
    ("GET", "/api/feedbacks/summary"): feedback_summary,
}
