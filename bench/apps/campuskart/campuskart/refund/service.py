"""Business rules for refunds."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..order import repo as order_repo
from . import repo
from .model import Refund


def create(data: dict) -> Refund:
    refund = Refund(
        order_id=int(data["order_id"]),
        amount=to_money(data["amount"]),
        asked_on=parse_date(data["asked_on"]),
    )
    order_repo.find(refund.order_id)
    return repo.save(refund)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_refunds()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
        "latest_asked_on": max((i.asked_on for i in items), default=None),
    }


def overdue(refunds: list | None = None, today=None) -> list:
    """Refunds whose asked_on is in the past."""
    items = refunds if refunds is not None else repo.all_refunds()
    return [i for i in items if is_past(i.asked_on, today)]
