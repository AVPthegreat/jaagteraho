"""Clinic queue, appointments, prescriptions and bills. Routes every request to its handler."""

from .core.errors import NotFound
from .core.http import fail
from .patient import routes as patient_routes
from .doctor import routes as doctor_routes
from .appointment import routes as appointment_routes
from .prescription import routes as prescription_routes
from .medicine import routes as medicine_routes
from .bill import routes as bill_routes
from .lab import routes as lab_routes
from .report import routes as report_routes
from .visit import routes as visit_routes

ROUTES = {}
ROUTES.update(patient_routes.ROUTES)
ROUTES.update(doctor_routes.ROUTES)
ROUTES.update(appointment_routes.ROUTES)
ROUTES.update(prescription_routes.ROUTES)
ROUTES.update(medicine_routes.ROUTES)
ROUTES.update(bill_routes.ROUTES)
ROUTES.update(lab_routes.ROUTES)
ROUTES.update(report_routes.ROUTES)
ROUTES.update(visit_routes.ROUTES)


def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    handler = ROUTES.get((method, path))
    if handler is None:
        return fail(NotFound(f"no route {method} {path}"))
    return handler({"body": body or {}, "query": query or {}, "path": path})
