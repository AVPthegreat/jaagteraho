"""Business rules for offers."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..listing import repo as listing_repo
from . import repo
from .model import Offer


def create(data: dict) -> Offer:
    offer = Offer(
        listing_id=int(data["listing_id"]),
        amount=to_money(data["amount"]),
        made_on=parse_date(data["made_on"]),
    )
    listing_repo.find(offer.listing_id)
    return repo.save(offer)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_offers()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
        "latest_made_on": max((i.made_on for i in items), default=None),
    }


def overdue(offers: list | None = None, today=None) -> list:
    """Offers whose made_on is in the past."""
    items = offers if offers is not None else repo.all_offers()
    return [i for i in items if is_past(i.made_on, today)]
