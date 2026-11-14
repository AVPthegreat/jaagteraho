"""Where students are kept."""

from ..core.store import Store
from .model import Student

STUDENTS = Store("student")


def save(student: Student) -> Student:
    return STUDENTS.add(student.validate())


def find(student_id: int) -> Student:
    return STUDENTS.get(student_id)


def all_students() -> list[Student]:
    return STUDENTS.all()


def remove(student_id: int) -> None:
    STUDENTS.delete(student_id)
