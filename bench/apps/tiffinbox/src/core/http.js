'use strict';
const { ValidationError } = require('./errors');
// Tiny request and response helpers shared by every route.
function requireFields(body, ...names) {
  const missing = names.filter((n) => body[n] === undefined || body[n] === null || body[n] === '');
  if (missing.length) throw new ValidationError(`missing: ${missing.join(', ')}`);
}
const ok = (data, status = 200) => ({ status, data });
const fail = (error) => ({ status: error.status, error: error.message });
function queryInt(request, name, fallback) {
  const value = (request.query || {})[name];
  return value === undefined || value === '' ? fallback : parseInt(value, 10);
}
module.exports = { requireFields, ok, fail, queryInt };
