"""Where orders are kept."""

from ..core.store import Store
from .model import Order

ORDERS = Store("order")


def save(order: Order) -> Order:
    return ORDERS.add(order.validate())


def find(order_id: int) -> Order:
    return ORDERS.get(order_id)


def all_orders() -> list[Order]:
    return ORDERS.all()


def remove(order_id: int) -> None:
    ORDERS.delete(order_id)
