"""HTTP handlers for /api/plagiarisms."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_plagiarism(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "submission_id", "similarity")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_plagiarisms(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_plagiarisms()]
    return ok(paginate(rows, page, size))


def plagiarism_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/plagiarisms"): create_plagiarism,
    ("GET", "/api/plagiarisms"): list_plagiarisms,
    ("GET", "/api/plagiarisms/summary"): plagiarism_summary,
}
