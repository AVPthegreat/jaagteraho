"""Business rules for buses."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Bus


def create(data: dict) -> Bus:
    bus = Bus(
        plate=str(data["plate"]).strip(),
        seats=int(data["seats"]),
        bought_on=parse_date(data["bought_on"]),
    )
    return repo.save(bus)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_buses()
    return {
        "count": len(items),
        "total_seats": sum(i.seats for i in items),
        "latest_bought_on": max((i.bought_on for i in items), default=None),
    }


def overdue(buses: list | None = None, today=None) -> list:
    """Buses whose bought_on is in the past."""
    items = buses if buses is not None else repo.all_buses()
    return [i for i in items if is_past(i.bought_on, today)]
