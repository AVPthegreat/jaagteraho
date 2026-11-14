"""Business rules for orders."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..listing import repo as listing_repo
from . import repo
from .model import Order


def create(data: dict) -> Order:
    order = Order(
        listing_id=int(data["listing_id"]),
        quantity=int(data["quantity"]),
        total=to_money(data["total"]),
        placed_on=parse_date(data["placed_on"]),
    )
    listing_repo.find(order.listing_id)
    return repo.save(order)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_orders()
    return {
        "count": len(items),
        "total_total": str(total(i.total for i in items)),
        "average_total": str(to_money(total(i.total for i in items) / len(items))) if items else "0.00",
        "total_quantity": sum(i.quantity for i in items),
        "latest_placed_on": max((i.placed_on for i in items), default=None),
    }


def overdue(orders: list | None = None, today=None) -> list:
    """Orders whose placed_on is in the past."""
    items = orders if orders is not None else repo.all_orders()
    return [i for i in items if is_past(i.placed_on, today)]


def per_unit(order_id: int):
    """total per quantity, for reports."""
    item = repo.find(order_id)
    return to_money(item.total / item.quantity)
