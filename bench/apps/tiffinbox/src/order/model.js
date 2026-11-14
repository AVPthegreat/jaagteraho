'use strict';
const { ValidationError } = require('../core/errors');
const { isoDay } = require('../core/dates');

// Order records.
function validate(item) {
  if (!(item.total >= 0)) throw new ValidationError('total must not be negative');
  if (!(item.plates >= 0)) throw new ValidationError('plates must not be negative');
  return item;
}

function describe(item) {
  return `#${item.id} · Rs ${item.total.toFixed(2)} · on ${isoDay(item.placedOn)}`;
}

module.exports = { validate, describe };
