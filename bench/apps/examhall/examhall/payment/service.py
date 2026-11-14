"""Business rules for payments."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..student import repo as student_repo
from . import repo
from .model import Payment


def create(data: dict) -> Payment:
    payment = Payment(
        student_id=int(data["student_id"]),
        amount=to_money(data["amount"]),
        paid_on=parse_date(data["paid_on"]),
    )
    student_repo.find(payment.student_id)
    return repo.save(payment)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_payments()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
        "latest_paid_on": max((i.paid_on for i in items), default=None),
    }


def overdue(payments: list | None = None, today=None) -> list:
    """Payments whose paid_on is in the past."""
    items = payments if payments is not None else repo.all_payments()
    return [i for i in items if is_past(i.paid_on, today)]
