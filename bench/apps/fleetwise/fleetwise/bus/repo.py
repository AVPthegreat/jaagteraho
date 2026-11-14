"""Where buses are kept."""

from ..core.store import Store
from .model import Bus

BUSES = Store("bus")


def save(bus: Bus) -> Bus:
    return BUSES.add(bus.validate())


def find(bus_id: int) -> Bus:
    return BUSES.get(bus_id)


def all_buses() -> list[Bus]:
    return BUSES.all()


def remove(bus_id: int) -> None:
    BUSES.delete(bus_id)
