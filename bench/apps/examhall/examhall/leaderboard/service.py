"""Business rules for leaderboards."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..exam import repo as exam_repo
from . import repo
from .model import Leaderboard


def create(data: dict) -> Leaderboard:
    leaderboard = Leaderboard(
        exam_id=int(data["exam_id"]),
        entries=int(data["entries"]),
    )
    exam_repo.find(leaderboard.exam_id)
    return repo.save(leaderboard)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_leaderboards()
    return {
        "count": len(items),
        "total_entries": sum(i.entries for i in items),
    }
