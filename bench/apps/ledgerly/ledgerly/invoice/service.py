"""Business rules for invoices."""

from ..core.dates import is_past, parse_date
from ..core.money import add_rate, to_money, total
from ..customer import repo as customer_repo
from . import repo
from .model import Invoice


def create(data: dict) -> Invoice:
    invoice = Invoice(
        customer_id=int(data["customer_id"]),
        amount=to_money(data["amount"]),
        gst_rate=float(data["gst_rate"]),
        issued_on=parse_date(data["issued_on"]),
    )
    customer_repo.find(invoice.customer_id)
    return repo.save(invoice)


def summary(items: list | None = None) -> dict:
    items = items if items is not None else repo.all_invoices()
    return {
        "count": len(items),
        "total_amount": str(total(i.amount for i in items)),
        "average_amount": str(to_money(total(i.amount for i in items) / len(items))) if items else "0.00",
        "latest_issued_on": max((i.issued_on for i in items), default=None),
    }


def overdue(invoices: list | None = None, today=None) -> list:
    """Invoices whose issued_on is in the past."""
    items = invoices if invoices is not None else repo.all_invoices()
    return [i for i in items if is_past(i.issued_on, today)]


def with_rate(invoice_id: int):
    item = repo.find(invoice_id)
    return add_rate(item.amount, item.gst_rate)
