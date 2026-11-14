"""Batch records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Batch:
    name: str
    college_id: int
    size: int
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Batch":
        if self.size < 0:
            raise ValidationError("size must not be negative")
        if not self.name:
            raise ValidationError("name is required")
        return self

    def describe(self) -> str:
        return f"{self.name}"
