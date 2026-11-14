"""Where pickups are kept."""

from ..core.store import Store
from .model import Pickup

PICKUPS = Store("pickup")


def save(pickup: Pickup) -> Pickup:
    return PICKUPS.add(pickup.validate())


def find(pickup_id: int) -> Pickup:
    return PICKUPS.get(pickup_id)


def all_pickups() -> list[Pickup]:
    return PICKUPS.all()


def remove(pickup_id: int) -> None:
    PICKUPS.delete(pickup_id)
