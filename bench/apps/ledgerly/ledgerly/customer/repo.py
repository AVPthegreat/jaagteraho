"""Where customers are kept."""

from ..core.store import Store
from .model import Customer

CUSTOMERS = Store("customer")


def save(customer: Customer) -> Customer:
    return CUSTOMERS.add(customer.validate())


def find(customer_id: int) -> Customer:
    return CUSTOMERS.get(customer_id)


def all_customers() -> list[Customer]:
    return CUSTOMERS.all()


def remove(customer_id: int) -> None:
    CUSTOMERS.delete(customer_id)
