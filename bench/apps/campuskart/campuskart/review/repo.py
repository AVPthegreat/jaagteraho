"""Where reviews are kept."""

from ..core.store import Store
from .model import Review

REVIEWS = Store("review")


def save(review: Review) -> Review:
    return REVIEWS.add(review.validate())


def find(review_id: int) -> Review:
    return REVIEWS.get(review_id)


def all_reviews() -> list[Review]:
    return REVIEWS.all()


def remove(review_id: int) -> None:
    REVIEWS.delete(review_id)
