"""Report records."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..core.errors import ValidationError


@dataclass
class Report:
    lab_id: int
    patient_id: int
    ready_on: date
    id: int = 0
    tags: list = field(default_factory=list)

    def validate(self) -> "Report":
        return self

    def describe(self) -> str:
        return f"#{self.id} · on {self.ready_on.isoformat()}"
