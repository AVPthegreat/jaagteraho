"""Where invoices are kept."""

from ..core.store import Store
from .model import Invoice

INVOICES = Store("invoice")


def save(invoice: Invoice) -> Invoice:
    return INVOICES.add(invoice.validate())


def find(invoice_id: int) -> Invoice:
    return INVOICES.get(invoice_id)


def all_invoices() -> list[Invoice]:
    return INVOICES.all()


def remove(invoice_id: int) -> None:
    INVOICES.delete(invoice_id)
