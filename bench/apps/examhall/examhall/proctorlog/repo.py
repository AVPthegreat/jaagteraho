"""Where proctorlogs are kept."""

from ..core.store import Store
from .model import Proctorlog

PROCTORLOGS = Store("proctorlog")


def save(proctorlog: Proctorlog) -> Proctorlog:
    return PROCTORLOGS.add(proctorlog.validate())


def find(proctorlog_id: int) -> Proctorlog:
    return PROCTORLOGS.get(proctorlog_id)


def all_proctorlogs() -> list[Proctorlog]:
    return PROCTORLOGS.all()


def remove(proctorlog_id: int) -> None:
    PROCTORLOGS.delete(proctorlog_id)
