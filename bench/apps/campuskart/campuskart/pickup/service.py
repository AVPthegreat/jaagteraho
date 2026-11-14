"""Business rules for pickups."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..order import repo as order_repo
from . import repo
from .model import Pickup


def create(data: dict) -> Pickup:
    pickup = Pickup(
        order_id=int(data["order_id"]),
        spot=str(data["spot"]).strip(),
        at=parse_date(data["at"]),
    )
    order_repo.find(pickup.order_id)
    return repo.save(pickup)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_pickups()
    return {
        "count": len(items),
        "latest_at": max((i.at for i in items), default=None),
    }


def overdue(pickups: list | None = None, today=None) -> list:
    """Pickups whose at is in the past."""
    items = pickups if pickups is not None else repo.all_pickups()
    return [i for i in items if is_past(i.at, today)]
