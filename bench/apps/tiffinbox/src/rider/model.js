'use strict';
const { ValidationError } = require('../core/errors');
const { isoDay } = require('../core/dates');

// Rider records.
function validate(item) {
  if (!(item.trips >= 0)) throw new ValidationError('trips must not be negative');
  if (!item.name) throw new ValidationError('name is required');
  return item;
}

function describe(item) {
  return `${item.name} · on ${isoDay(item.joinedOn)}`;
}

module.exports = { validate, describe };
