"""Text helpers for names and titles."""

import re


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def truncate(text: str, limit: int = 60) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def initials(name: str) -> str:
    return "".join(part[0].upper() for part in name.split() if part)
