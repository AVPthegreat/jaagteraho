"""Where certificates are kept."""

from ..core.store import Store
from .model import Certificate

CERTIFICATES = Store("certificate")


def save(certificate: Certificate) -> Certificate:
    return CERTIFICATES.add(certificate.validate())


def find(certificate_id: int) -> Certificate:
    return CERTIFICATES.get(certificate_id)


def all_certificates() -> list[Certificate]:
    return CERTIFICATES.all()


def remove(certificate_id: int) -> None:
    CERTIFICATES.delete(certificate_id)
