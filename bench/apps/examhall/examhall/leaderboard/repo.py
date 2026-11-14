"""Where leaderboards are kept."""

from ..core.store import Store
from .model import Leaderboard

LEADERBOARDS = Store("leaderboard")


def save(leaderboard: Leaderboard) -> Leaderboard:
    return LEADERBOARDS.add(leaderboard.validate())


def find(leaderboard_id: int) -> Leaderboard:
    return LEADERBOARDS.get(leaderboard_id)


def all_leaderboards() -> list[Leaderboard]:
    return LEADERBOARDS.all()


def remove(leaderboard_id: int) -> None:
    LEADERBOARDS.delete(leaderboard_id)
