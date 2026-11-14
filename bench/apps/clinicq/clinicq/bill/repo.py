"""Where bills are kept."""

from ..core.store import Store
from .model import Bill

BILLS = Store("bill")


def save(bill: Bill) -> Bill:
    return BILLS.add(bill.validate())


def find(bill_id: int) -> Bill:
    return BILLS.get(bill_id)


def all_bills() -> list[Bill]:
    return BILLS.all()


def remove(bill_id: int) -> None:
    BILLS.delete(bill_id)
