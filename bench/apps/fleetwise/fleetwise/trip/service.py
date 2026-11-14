"""Business rules for trips."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..bus import repo as bus_repo
from ..route import repo as route_repo
from . import repo
from .model import Trip


def create(data: dict) -> Trip:
    trip = Trip(
        bus_id=int(data["bus_id"]),
        route_id=int(data["route_id"]),
        riders=int(data["riders"]),
        ran_on=parse_date(data["ran_on"]),
    )
    bus_repo.find(trip.bus_id)
    route_repo.find(trip.route_id)
    return repo.save(trip)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_trips()
    return {
        "count": len(items),
        "total_riders": sum(i.riders for i in items),
        "latest_ran_on": max((i.ran_on for i in items), default=None),
    }


def overdue(trips: list | None = None, today=None) -> list:
    """Trips whose ran_on is in the past."""
    items = trips if trips is not None else repo.all_trips()
    return [i for i in items if is_past(i.ran_on, today)]
