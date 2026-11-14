"""Opens an exam for a student when its start time has passed."""

from datetime import datetime, timedelta

from django.utils import timezone

EXAM = {
    "title": "Data Structures, Mid-term",
    "duration_minutes": 90,
}


def exam_start_time():
    # The exam opens at the top of the current hour, India time.
    now = datetime.now()
    return now.replace(minute=0, second=0, microsecond=0)


def open_exam():
    starts_at = exam_start_time()
    if timezone.now() < starts_at:
        return {"ok": False, "error": "This exam has not started yet"}
    ends_at = starts_at + timedelta(minutes=EXAM["duration_minutes"])
    return {"ok": True, "title": EXAM["title"], "ends_at": ends_at.isoformat()}
