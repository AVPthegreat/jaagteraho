"""Money helpers. Amounts are rupees with two decimals."""

from decimal import ROUND_HALF_UP, Decimal


def to_money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def add_rate(amount, rate) -> Decimal:
    """Adds a percentage, e.g. GST at 18 percent."""
    return to_money(to_money(amount) * (1 + Decimal(str(rate)) / 100))


def apply_discount(amount, rate) -> Decimal:
    rate = max(0, min(100, rate))
    return to_money(to_money(amount) * (1 - Decimal(str(rate)) / 100))


def split_evenly(amount, people: int) -> Decimal:
    if people <= 0:
        raise ValueError("people must be positive")
    return to_money(to_money(amount) / people)


def total(amounts) -> Decimal:
    return to_money(sum((to_money(a) for a in amounts), Decimal("0")))
