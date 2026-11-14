"""Business rules for sellers."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Seller


def create(data: dict) -> Seller:
    seller = Seller(
        name=str(data["name"]).strip(),
        rating_sum=int(data["rating_sum"]),
        joined_on=parse_date(data["joined_on"]),
    )
    return repo.save(seller)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_sellers()
    return {
        "count": len(items),
        "total_rating_sum": sum(i.rating_sum for i in items),
        "latest_joined_on": max((i.joined_on for i in items), default=None),
    }


def overdue(sellers: list | None = None, today=None) -> list:
    """Sellers whose joined_on is in the past."""
    items = sellers if sellers is not None else repo.all_sellers()
    return [i for i in items if is_past(i.joined_on, today)]
