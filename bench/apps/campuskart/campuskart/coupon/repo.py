"""Where coupons are kept."""

from ..core.store import Store
from .model import Coupon

COUPONS = Store("coupon")


def save(coupon: Coupon) -> Coupon:
    return COUPONS.add(coupon.validate())


def find(coupon_id: int) -> Coupon:
    return COUPONS.get(coupon_id)


def all_coupons() -> list[Coupon]:
    return COUPONS.all()


def remove(coupon_id: int) -> None:
    COUPONS.delete(coupon_id)
