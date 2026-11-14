"""Wishlist records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Wishlist:
    student: str
    listing_id: int
    added_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Wishlist":
        if not self.student:
            raise ValidationError("student is required")
        return self

    def describe(self) -> str:
        return f"{self.student} · on {self.added_on.isoformat()}"
