"""Hostel mess menus, meal bookings and monthly bills. Routes every request to its handler."""

from .core.errors import NotFound
from .core.http import fail
from .meal import routes as meal_routes
from .booking import routes as booking_routes

ROUTES = {}
ROUTES.update(meal_routes.ROUTES)
ROUTES.update(booking_routes.ROUTES)


def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    handler = ROUTES.get((method, path))
    if handler is None:
        return fail(NotFound(f"no route {method} {path}"))
    return handler({"body": body or {}, "query": query or {}, "path": path})
