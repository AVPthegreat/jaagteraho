"""Business rules for reviews."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..order import repo as order_repo
from . import repo
from .model import Review


def create(data: dict) -> Review:
    review = Review(
        order_id=int(data["order_id"]),
        stars=int(data["stars"]),
        text=str(data["text"]).strip(),
    )
    order_repo.find(review.order_id)
    return repo.save(review)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_reviews()
    return {
        "count": len(items),
        "total_stars": sum(i.stars for i in items),
    }
