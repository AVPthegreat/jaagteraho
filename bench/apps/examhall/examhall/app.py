"""An online exam platform: exams, questions, attempts, submissions and results. Routes every request to its handler."""

from .core.errors import NotFound
from .core.http import fail
from .college import routes as college_routes
from .student import routes as student_routes
from .exam import routes as exam_routes
from .question import routes as question_routes
from .attempt import routes as attempt_routes
from .submission import routes as submission_routes
from .result import routes as result_routes
from .proctorlog import routes as proctorlog_routes
from .certificate import routes as certificate_routes
from .batch import routes as batch_routes
from .invigilator import routes as invigilator_routes
from .hall import routes as hall_routes
from .slot import routes as slot_routes
from .payment import routes as payment_routes
from .notice import routes as notice_routes
from .feedback import routes as feedback_routes
from .leaderboard import routes as leaderboard_routes
from .plagiarism import routes as plagiarism_routes

ROUTES = {}
ROUTES.update(college_routes.ROUTES)
ROUTES.update(student_routes.ROUTES)
ROUTES.update(exam_routes.ROUTES)
ROUTES.update(question_routes.ROUTES)
ROUTES.update(attempt_routes.ROUTES)
ROUTES.update(submission_routes.ROUTES)
ROUTES.update(result_routes.ROUTES)
ROUTES.update(proctorlog_routes.ROUTES)
ROUTES.update(certificate_routes.ROUTES)
ROUTES.update(batch_routes.ROUTES)
ROUTES.update(invigilator_routes.ROUTES)
ROUTES.update(hall_routes.ROUTES)
ROUTES.update(slot_routes.ROUTES)
ROUTES.update(payment_routes.ROUTES)
ROUTES.update(notice_routes.ROUTES)
ROUTES.update(feedback_routes.ROUTES)
ROUTES.update(leaderboard_routes.ROUTES)
ROUTES.update(plagiarism_routes.ROUTES)


def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    handler = ROUTES.get((method, path))
    if handler is None:
        return fail(NotFound(f"no route {method} {path}"))
    return handler({"body": body or {}, "query": query or {}, "path": path})
