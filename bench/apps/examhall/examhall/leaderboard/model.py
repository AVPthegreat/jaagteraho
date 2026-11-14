"""Leaderboard records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Leaderboard:
    exam_id: int
    entries: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Leaderboard":
        if self.entries < 0:
            raise ValidationError("entries must not be negative")
        return self

    def describe(self) -> str:
        return f"#{self.id}"
