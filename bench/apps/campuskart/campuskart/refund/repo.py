"""Where refunds are kept."""

from ..core.store import Store
from .model import Refund

REFUNDS = Store("refund")


def save(refund: Refund) -> Refund:
    return REFUNDS.add(refund.validate())


def find(refund_id: int) -> Refund:
    return REFUNDS.get(refund_id)


def all_refunds() -> list[Refund]:
    return REFUNDS.all()


def remove(refund_id: int) -> None:
    REFUNDS.delete(refund_id)
