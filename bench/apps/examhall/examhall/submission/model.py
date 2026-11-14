"""Submission records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Submission:
    attempt_id: int
    code: str
    score: int
    submitted_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Submission":
        if self.score < 0:
            raise ValidationError("score must not be negative")
        if not self.code:
            raise ValidationError("code is required")
        return self

    def describe(self) -> str:
        return f"{self.code} · on {self.submitted_on.isoformat()}"
