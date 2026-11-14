"""Where questions are kept."""

from ..core.store import Store
from .model import Question

QUESTIONS = Store("question")


def save(question: Question) -> Question:
    return QUESTIONS.add(question.validate())


def find(question_id: int) -> Question:
    return QUESTIONS.get(question_id)


def all_questions() -> list[Question]:
    return QUESTIONS.all()


def remove(question_id: int) -> None:
    QUESTIONS.delete(question_id)
