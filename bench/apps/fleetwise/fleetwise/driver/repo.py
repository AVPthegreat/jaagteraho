"""Where drivers are kept."""

from ..core.store import Store
from .model import Driver

DRIVERS = Store("driver")


def save(driver: Driver) -> Driver:
    return DRIVERS.add(driver.validate())


def find(driver_id: int) -> Driver:
    return DRIVERS.get(driver_id)


def all_drivers() -> list[Driver]:
    return DRIVERS.all()


def remove(driver_id: int) -> None:
    DRIVERS.delete(driver_id)
