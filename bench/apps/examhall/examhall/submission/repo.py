"""Where submissions are kept."""

from ..core.store import Store
from .model import Submission

SUBMISSIONS = Store("submission")


def save(submission: Submission) -> Submission:
    return SUBMISSIONS.add(submission.validate())


def find(submission_id: int) -> Submission:
    return SUBMISSIONS.get(submission_id)


def all_submissions() -> list[Submission]:
    return SUBMISSIONS.all()


def remove(submission_id: int) -> None:
    SUBMISSIONS.delete(submission_id)
