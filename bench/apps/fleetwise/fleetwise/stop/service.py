"""Business rules for stops."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..route import repo as route_repo
from . import repo
from .model import Stop


def create(data: dict) -> Stop:
    stop = Stop(
        name=str(data["name"]).strip(),
        route_id=int(data["route_id"]),
        order=int(data["order"]),
    )
    route_repo.find(stop.route_id)
    return repo.save(stop)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_stops()
    return {
        "count": len(items),
        "total_order": sum(i.order for i in items),
    }
