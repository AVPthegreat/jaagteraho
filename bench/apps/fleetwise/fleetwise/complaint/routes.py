"""HTTP handlers for /api/complaints."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_complaint(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "text", "trip_id", "filed_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_complaints(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_complaints()]
    return ok(paginate(rows, page, size))


def complaint_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/complaints"): create_complaint,
    ("GET", "/api/complaints"): list_complaints,
    ("GET", "/api/complaints/summary"): complaint_summary,
}
