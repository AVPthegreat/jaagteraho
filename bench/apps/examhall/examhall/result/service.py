"""Business rules for results."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..attempt import repo as attempt_repo
from . import repo
from .model import Result


def create(data: dict) -> Result:
    result = Result(
        attempt_id=int(data["attempt_id"]),
        marks=int(data["marks"]),
        percent=float(data["percent"]),
    )
    attempt_repo.find(result.attempt_id)
    return repo.save(result)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_results()
    return {
        "count": len(items),
        "total_marks": sum(i.marks for i in items),
    }
