'use strict';
const { ValidationError } = require('../core/errors');
const { isoDay } = require('../core/dates');

// Kitchen records.
function validate(item) {
  if (!(item.rating >= 0)) throw new ValidationError('rating must not be negative');
  if (!item.name) throw new ValidationError('name is required');
  return item;
}

function describe(item) {
  return `${item.name} · on ${isoDay(item.openedOn)}`;
}

module.exports = { validate, describe };
