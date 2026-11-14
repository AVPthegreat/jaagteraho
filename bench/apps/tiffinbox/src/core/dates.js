'use strict';
// Dates arrive as YYYY-MM-DD strings.
function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text).trim());
  if (!m) throw new RangeError(`not a date: ${text}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}
function isPast(date, today = new Date()) {
  return date.getTime() < today.getTime();
}
module.exports = { parseDate, isoDay, isPast };
