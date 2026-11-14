"""Slot records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Slot:
    exam_id: int
    hall_id: int
    on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Slot":
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.on.isoformat()}"
