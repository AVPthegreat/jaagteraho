"""Business rules for payouts."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..seller import repo as seller_repo
from . import repo
from .model import Payout


def create(data: dict) -> Payout:
    payout = Payout(
        seller_id=int(data["seller_id"]),
        amount=to_money(data["amount"]),
        paid_on=parse_date(data["paid_on"]),
    )
    seller_repo.find(payout.seller_id)
    return repo.save(payout)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_payouts()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
        "latest_paid_on": max((i.paid_on for i in items), default=None),
    }


def overdue(payouts: list | None = None, today=None) -> list:
    """Payouts whose paid_on is in the past."""
    items = payouts if payouts is not None else repo.all_payouts()
    return [i for i in items if is_past(i.paid_on, today)]
