"""Where sellers are kept."""

from ..core.store import Store
from .model import Seller

SELLERS = Store("seller")


def save(seller: Seller) -> Seller:
    return SELLERS.add(seller.validate())


def find(seller_id: int) -> Seller:
    return SELLERS.get(seller_id)


def all_sellers() -> list[Seller]:
    return SELLERS.all()


def remove(seller_id: int) -> None:
    SELLERS.delete(seller_id)
