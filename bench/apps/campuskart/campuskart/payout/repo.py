"""Where payouts are kept."""

from ..core.store import Store
from .model import Payout

PAYOUTS = Store("payout")


def save(payout: Payout) -> Payout:
    return PAYOUTS.add(payout.validate())


def find(payout_id: int) -> Payout:
    return PAYOUTS.get(payout_id)


def all_payouts() -> list[Payout]:
    return PAYOUTS.all()


def remove(payout_id: int) -> None:
    PAYOUTS.delete(payout_id)
