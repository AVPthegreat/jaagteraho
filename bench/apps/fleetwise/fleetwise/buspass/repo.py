"""Where buspasses are kept."""

from ..core.store import Store
from .model import Buspass

BUSPASSES = Store("buspass")


def save(buspass: Buspass) -> Buspass:
    return BUSPASSES.add(buspass.validate())


def find(buspass_id: int) -> Buspass:
    return BUSPASSES.get(buspass_id)


def all_buspasses() -> list[Buspass]:
    return BUSPASSES.all()


def remove(buspass_id: int) -> None:
    BUSPASSES.delete(buspass_id)
