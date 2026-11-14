"""Where batches are kept."""

from ..core.store import Store
from .model import Batch

BATCHES = Store("batch")


def save(batch: Batch) -> Batch:
    return BATCHES.add(batch.validate())


def find(batch_id: int) -> Batch:
    return BATCHES.get(batch_id)


def all_batches() -> list[Batch]:
    return BATCHES.all()


def remove(batch_id: int) -> None:
    BATCHES.delete(batch_id)
