"""HTTP handlers for /api/notices."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_notice(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "title", "posted_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_notices(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_notices()]
    return ok(paginate(rows, page, size))


def notice_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/notices"): create_notice,
    ("GET", "/api/notices"): list_notices,
    ("GET", "/api/notices/summary"): notice_summary,
}
