"""HTTP handlers for /api/chats."""

from ..core.config import setting
from ..core.errors import AppError
from ..core.http import fail, ok, query_int, require_fields
from ..core.pagination import paginate
from . import repo, service


def create_chat(request: dict) -> dict:
    body = request.get("body") or {}
    try:
        require_fields(body, "listing_id", "messages", "started_on")
        return ok(service.create(body).describe(), 201)
    except AppError as error:
        return fail(error)


def list_chats(request: dict) -> dict:
    page = query_int(request, "page", 1)
    size = query_int(request, "size", setting("page_size"))
    rows = [r.describe() for r in repo.all_chats()]
    return ok(paginate(rows, page, size))


def chat_summary(request: dict) -> dict:
    return ok(service.summary())


ROUTES = {
    ("POST", "/api/chats"): create_chat,
    ("GET", "/api/chats"): list_chats,
    ("GET", "/api/chats/summary"): chat_summary,
}
