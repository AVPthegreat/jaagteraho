"""Where payments are kept."""

from ..core.store import Store
from .model import Payment

PAYMENTS = Store("payment")


def save(payment: Payment) -> Payment:
    return PAYMENTS.add(payment.validate())


def find(payment_id: int) -> Payment:
    return PAYMENTS.get(payment_id)


def all_payments() -> list[Payment]:
    return PAYMENTS.all()


def remove(payment_id: int) -> None:
    PAYMENTS.delete(payment_id)
