"""Business rules for certificates."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..result import repo as result_repo
from . import repo
from .model import Certificate


def create(data: dict) -> Certificate:
    certificate = Certificate(
        result_id=int(data["result_id"]),
        issued_on=parse_date(data["issued_on"]),
    )
    result_repo.find(certificate.result_id)
    return repo.save(certificate)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_certificates()
    return {
        "count": len(items),
        "latest_issued_on": max((i.issued_on for i in items), default=None),
    }


def overdue(certificates: list | None = None, today=None) -> list:
    """Certificates whose issued_on is in the past."""
    items = certificates if certificates is not None else repo.all_certificates()
    return [i for i in items if is_past(i.issued_on, today)]
