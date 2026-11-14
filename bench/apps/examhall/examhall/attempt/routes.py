"""HTTP handlers for /api/attempts."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_attempt(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "exam_id", "student_id", "started_on", "answered")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_attempts(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_attempts()]
    return ok(paginate(rows, page, size))


def attempt_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/attempts"): create_attempt,
    ("GET", "/api/attempts"): list_attempts,
    ("GET", "/api/attempts/summary"): attempt_summary,
}
