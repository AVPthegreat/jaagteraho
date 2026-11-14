"""College bus routes, trips and fuel logs. Routes every request to its handler."""

from .core.errors import NotFound
from .core.http import fail
from .bus import routes as bus_routes
from .driver import routes as driver_routes
from .route import routes as route_routes
from .trip import routes as trip_routes
from .fuel import routes as fuel_routes
from .stop import routes as stop_routes
from .buspass import routes as buspass_routes
from .complaint import routes as complaint_routes

ROUTES = {}
ROUTES.update(bus_routes.ROUTES)
ROUTES.update(driver_routes.ROUTES)
ROUTES.update(route_routes.ROUTES)
ROUTES.update(trip_routes.ROUTES)
ROUTES.update(fuel_routes.ROUTES)
ROUTES.update(stop_routes.ROUTES)
ROUTES.update(buspass_routes.ROUTES)
ROUTES.update(complaint_routes.ROUTES)


def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    handler = ROUTES.get((method, path))
    if handler is None:
        return fail(NotFound(f"no route {method} {path}"))
    return handler({"body": body or {}, "query": query or {}, "path": path})
