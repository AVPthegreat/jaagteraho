"""Business rules for feedbacks."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..exam import repo as exam_repo
from . import repo
from .model import Feedback


def create(data: dict) -> Feedback:
    feedback = Feedback(
        exam_id=int(data["exam_id"]),
        stars=int(data["stars"]),
        text=str(data["text"]).strip(),
    )
    exam_repo.find(feedback.exam_id)
    return repo.save(feedback)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_feedbacks()
    return {
        "count": len(items),
        "total_stars": sum(i.stars for i in items),
    }
