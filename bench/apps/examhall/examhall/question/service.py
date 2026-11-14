"""Business rules for questions."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..exam import repo as exam_repo
from . import repo
from .model import Question


def create(data: dict) -> Question:
    question = Question(
        exam_id=int(data["exam_id"]),
        text=str(data["text"]).strip(),
        marks=int(data["marks"]),
    )
    exam_repo.find(question.exam_id)
    return repo.save(question)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_questions()
    return {
        "count": len(items),
        "total_marks": sum(i.marks for i in items),
    }
