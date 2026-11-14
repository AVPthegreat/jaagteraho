"""Business rules for bills."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..appointment import repo as appointment_repo
from . import repo
from .model import Bill


def create(data: dict) -> Bill:
    bill = Bill(
        appointment_id=int(data["appointment_id"]),
        amount=to_money(data["amount"]),
        discount_rate=float(data["discount_rate"]),
    )
    appointment_repo.find(bill.appointment_id)
    return repo.save(bill)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_bills()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
    }


def with_rate(bill_id: int):
    item = repo.find(bill_id)
    return add_rate(item.amount, item.discount_rate)
