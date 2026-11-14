"""Dates arrive as YYYY-MM-DD strings; times are kept in UTC and shown in India time."""

from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def parse_date(text: str) -> date:
    return datetime.strptime(text.strip(), "%Y-%m-%d").date()


def days_between(start: date, end: date) -> int:
    return (end - start).days


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_ist(moment: datetime) -> datetime:
    return moment.astimezone(IST)


def is_past(day: date, today: date | None = None) -> bool:
    today = today or now_utc().date()
    return day < today
