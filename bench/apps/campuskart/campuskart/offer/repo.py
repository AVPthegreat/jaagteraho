"""Where offers are kept."""

from ..core.store import Store
from .model import Offer

OFFERS = Store("offer")


def save(offer: Offer) -> Offer:
    return OFFERS.add(offer.validate())


def find(offer_id: int) -> Offer:
    return OFFERS.get(offer_id)


def all_offers() -> list[Offer]:
    return OFFERS.all()


def remove(offer_id: int) -> None:
    OFFERS.delete(offer_id)
