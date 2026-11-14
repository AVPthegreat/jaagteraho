"""Business rules for halls."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Hall


def create(data: dict) -> Hall:
    hall = Hall(
        name=str(data["name"]).strip(),
        seats=int(data["seats"]),
    )
    return repo.save(hall)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_halls()
    return {
        "count": len(items),
        "total_seats": sum(i.seats for i in items),
    }
