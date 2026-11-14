"""Notice records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Notice:
    title: str
    posted_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Notice":
        if not self.title:
            raise ValidationError("title is required")
        return self

    def describe(self) -> str:
        return f"{self.title} · on {self.posted_on.isoformat()}"
