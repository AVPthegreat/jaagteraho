"""Where halls are kept."""

from ..core.store import Store
from .model import Hall

HALLS = Store("hall")


def save(hall: Hall) -> Hall:
    return HALLS.add(hall.validate())


def find(hall_id: int) -> Hall:
    return HALLS.get(hall_id)


def all_halls() -> list[Hall]:
    return HALLS.all()


def remove(hall_id: int) -> None:
    HALLS.delete(hall_id)
