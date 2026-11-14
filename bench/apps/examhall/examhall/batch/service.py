"""Business rules for batches."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..college import repo as college_repo
from . import repo
from .model import Batch


def create(data: dict) -> Batch:
    batch = Batch(
        name=str(data["name"]).strip(),
        college_id=int(data["college_id"]),
        size=int(data["size"]),
    )
    college_repo.find(batch.college_id)
    return repo.save(batch)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_batches()
    return {
        "count": len(items),
        "total_size": sum(i.size for i in items),
    }
