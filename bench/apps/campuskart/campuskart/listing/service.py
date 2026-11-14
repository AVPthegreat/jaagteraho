"""Business rules for listings."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..seller import repo as seller_repo
from . import repo
from .model import Listing


def create(data: dict) -> Listing:
    listing = Listing(
        seller_id=int(data["seller_id"]),
        title=str(data["title"]).strip(),
        price=to_money(data["price"]),
        listed_on=parse_date(data["listed_on"]),
    )
    seller_repo.find(listing.seller_id)
    return repo.save(listing)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_listings()
    return {
        "count": len(items),
        "total_price": str(total(i.price for i in items)),
        "average_price": str(to_money(total(i.price for i in items) / len(items))) if items else "0.00",
        "latest_listed_on": max((i.listed_on for i in items), default=None),
    }


def overdue(listings: list | None = None, today=None) -> list:
    """Listings whose listed_on is in the past."""
    items = listings if listings is not None else repo.all_listings()
    return [i for i in items if is_past(i.listed_on, today)]
