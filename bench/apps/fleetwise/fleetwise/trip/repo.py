"""Where trips are kept."""

from ..core.store import Store
from .model import Trip

TRIPS = Store("trip")


def save(trip: Trip) -> Trip:
    return TRIPS.add(trip.validate())


def find(trip_id: int) -> Trip:
    return TRIPS.get(trip_id)


def all_trips() -> list[Trip]:
    return TRIPS.all()


def remove(trip_id: int) -> None:
    TRIPS.delete(trip_id)
