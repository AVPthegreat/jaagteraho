"""Business rules for customers."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Customer


def create(data: dict) -> Customer:
    customer = Customer(
        name=str(data["name"]).strip(),
        credit_limit=to_money(data["credit_limit"]),
        since=parse_date(data["since"]),
    )
    return repo.save(customer)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_customers()
    return {
        "count": len(items),
        "total_credit_limit": str(total(i.credit_limit for i in items)),
        "average_credit_limit": str(to_money(total(i.credit_limit for i in items) / len(items))) if items else "0.00",
        "latest_since": max((i.since for i in items), default=None),
    }


def overdue(customers: list | None = None, today=None) -> list:
    """Customers whose since is in the past."""
    items = customers if customers is not None else repo.all_customers()
    return [i for i in items if is_past(i.since, today)]
