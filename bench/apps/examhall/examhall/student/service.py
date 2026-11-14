"""Business rules for students."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..college import repo as college_repo
from . import repo
from .model import Student


def create(data: dict) -> Student:
    student = Student(
        name=str(data["name"]).strip(),
        college_id=int(data["college_id"]),
        joined_on=parse_date(data["joined_on"]),
    )
    college_repo.find(student.college_id)
    return repo.save(student)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_students()
    return {
        "count": len(items),
        "latest_joined_on": max((i.joined_on for i in items), default=None),
    }


def overdue(students: list | None = None, today=None) -> list:
    """Students whose joined_on is in the past."""
    items = students if students is not None else repo.all_students()
    return [i for i in items if is_past(i.joined_on, today)]
