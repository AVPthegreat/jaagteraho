"""Invoices, payments and GST for small shops. Routes every request to its handler."""

from .core.errors import NotFound
from .core.http import fail
from .customer import routes as customer_routes
from .invoice import routes as invoice_routes
from .payment import routes as payment_routes
from .expense import routes as expense_routes

ROUTES = {}
ROUTES.update(customer_routes.ROUTES)
ROUTES.update(invoice_routes.ROUTES)
ROUTES.update(payment_routes.ROUTES)
ROUTES.update(expense_routes.ROUTES)


def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    handler = ROUTES.get((method, path))
    if handler is None:
        return fail(NotFound(f"no route {method} {path}"))
    return handler({"body": body or {}, "query": query or {}, "path": path})
