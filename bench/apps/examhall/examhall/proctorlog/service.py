"""Business rules for proctorlogs."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..attempt import repo as attempt_repo
from . import repo
from .model import Proctorlog


def create(data: dict) -> Proctorlog:
    proctorlog = Proctorlog(
        attempt_id=int(data["attempt_id"]),
        event=str(data["event"]).strip(),
        at=parse_date(data["at"]),
    )
    attempt_repo.find(proctorlog.attempt_id)
    return repo.save(proctorlog)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_proctorlogs()
    return {
        "count": len(items),
        "latest_at": max((i.at for i in items), default=None),
    }


def overdue(proctorlogs: list | None = None, today=None) -> list:
    """Proctorlogs whose at is in the past."""
    items = proctorlogs if proctorlogs is not None else repo.all_proctorlogs()
    return [i for i in items if is_past(i.at, today)]
