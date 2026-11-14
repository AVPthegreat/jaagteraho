"""HTTP handlers for /api/proctorlogs."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_proctorlog(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "attempt_id", "event", "at")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_proctorlogs(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_proctorlogs()]
    return ok(paginate(rows, page, size))


def proctorlog_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/proctorlogs"): create_proctorlog,
    ("GET", "/api/proctorlogs"): list_proctorlogs,
    ("GET", "/api/proctorlogs/summary"): proctorlog_summary,
}
