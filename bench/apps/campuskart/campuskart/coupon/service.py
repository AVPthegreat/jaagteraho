"""Business rules for coupons."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Coupon


def create(data: dict) -> Coupon:
    coupon = Coupon(
        code=str(data["code"]).strip(),
        discount_rate=float(data["discount_rate"]),
        valid_until=parse_date(data["valid_until"]),
    )
    return repo.save(coupon)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_coupons()
    return {
        "count": len(items),
        "latest_valid_until": max((i.valid_until for i in items), default=None),
    }


def overdue(coupons: list | None = None, today=None) -> list:
    """Coupons whose valid_until is in the past."""
    items = coupons if coupons is not None else repo.all_coupons()
    return [i for i in items if is_past(i.valid_until, today)]
