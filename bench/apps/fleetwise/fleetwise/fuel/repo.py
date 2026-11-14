"""Where fuels are kept."""

from ..core.store import Store
from .model import Fuel

FUELS = Store("fuel")


def save(fuel: Fuel) -> Fuel:
    return FUELS.add(fuel.validate())


def find(fuel_id: int) -> Fuel:
    return FUELS.get(fuel_id)


def all_fuels() -> list[Fuel]:
    return FUELS.all()


def remove(fuel_id: int) -> None:
    FUELS.delete(fuel_id)
