"""Review records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Review:
    order_id: int
    stars: int
    text: str
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Review":
        if self.stars < 0:
            raise ValidationError("stars must not be negative")
        if not self.text:
            raise ValidationError("text is required")
        return self

    def describe(self) -> str:
        return f"{self.text}"
