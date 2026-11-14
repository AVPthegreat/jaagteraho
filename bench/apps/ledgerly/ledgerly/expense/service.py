"""Business rules for expenses."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Expense


def create(data: dict) -> Expense:
    expense = Expense(
        label=str(data["label"]).strip(),
        amount=to_money(data["amount"]),
        spent_on=parse_date(data["spent_on"]),
    )
    return repo.save(expense)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_expenses()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
        "latest_spent_on": max((i.spent_on for i in items), default=None),
    }


def overdue(expenses: list | None = None, today=None) -> list:
    """Expenses whose spent_on is in the past."""
    items = expenses if expenses is not None else repo.all_expenses()
    return [i for i in items if is_past(i.spent_on, today)]
