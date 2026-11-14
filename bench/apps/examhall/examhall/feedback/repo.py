"""Where feedbacks are kept."""

from ..core.store import Store
from .model import Feedback

FEEDBACKS = Store("feedback")


def save(feedback: Feedback) -> Feedback:
    return FEEDBACKS.add(feedback.validate())


def find(feedback_id: int) -> Feedback:
    return FEEDBACKS.get(feedback_id)


def all_feedbacks() -> list[Feedback]:
    return FEEDBACKS.all()


def remove(feedback_id: int) -> None:
    FEEDBACKS.delete(feedback_id)
