"""Business rules for plagiarisms."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..submission import repo as submission_repo
from . import repo
from .model import Plagiarism


def create(data: dict) -> Plagiarism:
    plagiarism = Plagiarism(
        submission_id=int(data["submission_id"]),
        similarity=float(data["similarity"]),
    )
    submission_repo.find(plagiarism.submission_id)
    return repo.save(plagiarism)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_plagiarisms()
    return {
        "count": len(items),
    }
