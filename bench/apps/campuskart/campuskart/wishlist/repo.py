"""Where wishlists are kept."""

from ..core.store import Store
from .model import Wishlist

WISHLISTS = Store("wishlist")


def save(wishlist: Wishlist) -> Wishlist:
    return WISHLISTS.add(wishlist.validate())


def find(wishlist_id: int) -> Wishlist:
    return WISHLISTS.get(wishlist_id)


def all_wishlists() -> list[Wishlist]:
    return WISHLISTS.all()


def remove(wishlist_id: int) -> None:
    WISHLISTS.delete(wishlist_id)
