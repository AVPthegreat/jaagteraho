"""HTTP handlers for /api/invigilators."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_invigilator(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "exams")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_invigilators(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_invigilators()]
    return ok(paginate(rows, page, size))


def invigilator_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/invigilators"): create_invigilator,
    ("GET", "/api/invigilators"): list_invigilators,
    ("GET", "/api/invigilators/summary"): invigilator_summary,
}
