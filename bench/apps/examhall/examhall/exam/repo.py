"""Where exams are kept."""

from ..core.store import Store
from .model import Exam

EXAMS = Store("exam")


def save(exam: Exam) -> Exam:
    return EXAMS.add(exam.validate())


def find(exam_id: int) -> Exam:
    return EXAMS.get(exam_id)


def all_exams() -> list[Exam]:
    return EXAMS.all()


def remove(exam_id: int) -> None:
    EXAMS.delete(exam_id)
