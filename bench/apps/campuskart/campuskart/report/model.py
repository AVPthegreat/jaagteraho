"""Report records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Report:
    listing_id: int
    reason: str
    filed_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Report":
        if not self.reason:
            raise ValidationError("reason is required")
        return self

    def describe(self) -> str:
        return f"{self.reason} · on {self.filed_on.isoformat()}"
