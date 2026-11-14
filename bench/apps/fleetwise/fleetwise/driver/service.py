"""Business rules for drivers."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Driver


def create(data: dict) -> Driver:
    driver = Driver(
        name=str(data["name"]).strip(),
        licence_until=parse_date(data["licence_until"]),
        trips=int(data["trips"]),
    )
    return repo.save(driver)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_drivers()
    return {
        "count": len(items),
        "total_trips": sum(i.trips for i in items),
        "latest_licence_until": max((i.licence_until for i in items), default=None),
    }


def overdue(drivers: list | None = None, today=None) -> list:
    """Drivers whose licence_until is in the past."""
    items = drivers if drivers is not None else repo.all_drivers()
    return [i for i in items if is_past(i.licence_until, today)]
