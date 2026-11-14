"""Business rules for routes."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Route


def create(data: dict) -> Route:
    route = Route(
        name=str(data["name"]).strip(),
        km=int(data["km"]),
        fare=to_money(data["fare"]),
    )
    return repo.save(route)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_routes()
    return {
        "count": len(items),
        "total_fare": str(total(i.fare for i in items)),
        "average_fare": str(to_money(total(i.fare for i in items) / len(items))) if items else "0.00",
        "total_km": sum(i.km for i in items),
    }


def per_unit(route_id: int):
    """fare per km, for reports."""
    item = repo.find(route_id)
    return to_money(item.fare / item.km)
