'use strict';
const { ValidationError } = require('../core/errors');
const { isoDay } = require('../core/dates');

// Menu records.
function validate(item) {
  if (!(item.price >= 0)) throw new ValidationError('price must not be negative');
  if (!item.dish) throw new ValidationError('dish is required');
  return item;
}

function describe(item) {
  return `${item.dish} · Rs ${item.price.toFixed(2)} · on ${isoDay(item.servedOn)}`;
}

module.exports = { validate, describe };
