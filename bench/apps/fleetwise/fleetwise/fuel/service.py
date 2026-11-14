"""Business rules for fuels."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..bus import repo as bus_repo
from . import repo
from .model import Fuel


def create(data: dict) -> Fuel:
    fuel = Fuel(
        bus_id=int(data["bus_id"]),
        litres=int(data["litres"]),
        cost=to_money(data["cost"]),
        filled_on=parse_date(data["filled_on"]),
    )
    bus_repo.find(fuel.bus_id)
    return repo.save(fuel)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_fuels()
    return {
        "count": len(items),
        "total_cost": str(total(i.cost for i in items)),
        "average_cost": str(to_money(total(i.cost for i in items) / len(items))) if items else "0.00",
        "total_litres": sum(i.litres for i in items),
        "latest_filled_on": max((i.filled_on for i in items), default=None),
    }


def overdue(fuels: list | None = None, today=None) -> list:
    """Fuels whose filled_on is in the past."""
    items = fuels if fuels is not None else repo.all_fuels()
    return [i for i in items if is_past(i.filled_on, today)]


def per_unit(fuel_id: int):
    """cost per litres, for reports."""
    item = repo.find(fuel_id)
    return to_money(item.cost / item.litres)
