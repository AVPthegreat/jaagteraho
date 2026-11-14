"""Business rules for wishlists."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..listing import repo as listing_repo
from . import repo
from .model import Wishlist


def create(data: dict) -> Wishlist:
    wishlist = Wishlist(
        student=str(data["student"]).strip(),
        listing_id=int(data["listing_id"]),
        added_on=parse_date(data["added_on"]),
    )
    listing_repo.find(wishlist.listing_id)
    return repo.save(wishlist)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_wishlists()
    return {
        "count": len(items),
        "latest_added_on": max((i.added_on for i in items), default=None),
    }


def overdue(wishlists: list | None = None, today=None) -> list:
    """Wishlists whose added_on is in the past."""
    items = wishlists if wishlists is not None else repo.all_wishlists()
    return [i for i in items if is_past(i.added_on, today)]
