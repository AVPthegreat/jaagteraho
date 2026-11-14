"""Business rules for submissions."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..attempt import repo as attempt_repo
from . import repo
from .model import Submission


def create(data: dict) -> Submission:
    submission = Submission(
        attempt_id=int(data["attempt_id"]),
        code=str(data["code"]).strip(),
        score=int(data["score"]),
        submitted_on=parse_date(data["submitted_on"]),
    )
    attempt_repo.find(submission.attempt_id)
    return repo.save(submission)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_submissions()
    return {
        "count": len(items),
        "total_score": sum(i.score for i in items),
        "latest_submitted_on": max((i.submitted_on for i in items), default=None),
    }


def overdue(submissions: list | None = None, today=None) -> list:
    """Submissions whose submitted_on is in the past."""
    items = submissions if submissions is not None else repo.all_submissions()
    return [i for i in items if is_past(i.submitted_on, today)]
