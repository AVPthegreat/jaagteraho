"""Where stops are kept."""

from ..core.store import Store
from .model import Stop

STOPS = Store("stop")


def save(stop: Stop) -> Stop:
    return STOPS.add(stop.validate())


def find(stop_id: int) -> Stop:
    return STOPS.get(stop_id)


def all_stops() -> list[Stop]:
    return STOPS.all()


def remove(stop_id: int) -> None:
    STOPS.delete(stop_id)
