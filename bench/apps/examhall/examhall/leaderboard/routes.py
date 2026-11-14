"""HTTP handlers for /api/leaderboards."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_leaderboard(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "exam_id", "entries")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_leaderboards(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_leaderboards()]
    return ok(paginate(rows, page, size))


def leaderboard_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/leaderboards"): create_leaderboard,
    ("GET", "/api/leaderboards"): list_leaderboards,
    ("GET", "/api/leaderboards/summary"): leaderboard_summary,
}
