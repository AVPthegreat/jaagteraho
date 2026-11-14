'use strict';
// Errors the app raises on purpose; routes turn them into clear responses.
class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
class ValidationError extends AppError { constructor(message) { super(message, 400); } }
class NotFound extends AppError { constructor(message) { super(message, 404); } }
module.exports = { AppError, ValidationError, NotFound };
