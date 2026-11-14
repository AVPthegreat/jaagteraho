"""Plagiarism records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Plagiarism:
    submission_id: int
    similarity: float
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Plagiarism":
        if not 0 <= self.similarity <= 100:
            raise ValidationError("similarity must be between 0 and 100")
        return self

    def describe(self) -> str:
        return f"#{self.id}"
