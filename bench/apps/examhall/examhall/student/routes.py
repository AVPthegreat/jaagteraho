"""HTTP handlers for /api/students."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_student(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "name", "college_id", "joined_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_students(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_students()]
    return ok(paginate(rows, page, size))


def student_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/students"): create_student,
    ("GET", "/api/students"): list_students,
    ("GET", "/api/students/summary"): student_summary,
}
