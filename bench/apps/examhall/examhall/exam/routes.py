"""HTTP handlers for /api/exams."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_exam(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "title", "duration_min", "starts_on", "fee")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_exams(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_exams()]
    return ok(paginate(rows, page, size))


def exam_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/exams"): create_exam,
    ("GET", "/api/exams"): list_exams,
    ("GET", "/api/exams/summary"): exam_summary,
}
