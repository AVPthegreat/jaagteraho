"""Where routes are kept."""

from ..core.store import Store
from .model import Route

ROUTES = Store("route")


def save(route: Route) -> Route:
    return ROUTES.add(route.validate())


def find(route_id: int) -> Route:
    return ROUTES.get(route_id)


def all_routes() -> list[Route]:
    return ROUTES.all()


def remove(route_id: int) -> None:
    ROUTES.delete(route_id)
