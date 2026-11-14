"""Where expenses are kept."""

from ..core.store import Store
from .model import Expense

EXPENSES = Store("expense")


def save(expense: Expense) -> Expense:
    return EXPENSES.add(expense.validate())


def find(expense_id: int) -> Expense:
    return EXPENSES.get(expense_id)


def all_expenses() -> list[Expense]:
    return EXPENSES.all()


def remove(expense_id: int) -> None:
    EXPENSES.delete(expense_id)
