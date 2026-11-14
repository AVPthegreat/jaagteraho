"""Errors the app raises on purpose; routes turn them into clear responses."""


class AppError(Exception):
    status = 400


class ValidationError(AppError):
    status = 400


class NotFound(AppError):
    status = 404
