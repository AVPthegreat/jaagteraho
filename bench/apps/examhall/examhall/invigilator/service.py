"""Business rules for invigilators."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from . import repo
from .model import Invigilator


def create(data: dict) -> Invigilator:
    invigilator = Invigilator(
        name=str(data["name"]).strip(),
        exams=int(data["exams"]),
    )
    return repo.save(invigilator)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_invigilators()
    return {
        "count": len(items),
        "total_exams": sum(i.exams for i in items),
    }
