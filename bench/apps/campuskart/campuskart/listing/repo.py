"""Where listings are kept."""

from ..core.store import Store
from .model import Listing

LISTINGS = Store("listing")


def save(listing: Listing) -> Listing:
    return LISTINGS.add(listing.validate())


def find(listing_id: int) -> Listing:
    return LISTINGS.get(listing_id)


def all_listings() -> list[Listing]:
    return LISTINGS.all()


def remove(listing_id: int) -> None:
    LISTINGS.delete(listing_id)
