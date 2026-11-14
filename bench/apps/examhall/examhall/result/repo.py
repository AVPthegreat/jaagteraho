"""Where results are kept."""

from ..core.store import Store
from .model import Result

RESULTS = Store("result")


def save(result: Result) -> Result:
    return RESULTS.add(result.validate())


def find(result_id: int) -> Result:
    return RESULTS.get(result_id)


def all_results() -> list[Result]:
    return RESULTS.all()


def remove(result_id: int) -> None:
    RESULTS.delete(result_id)
