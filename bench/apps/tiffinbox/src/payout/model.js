'use strict';
const { ValidationError } = require('../core/errors');
const { isoDay } = require('../core/dates');

// Payout records.
function validate(item) {
  if (!(item.amount >= 0)) throw new ValidationError('amount must not be negative');
  return item;
}

function describe(item) {
  return `#${item.id} · Rs ${item.amount.toFixed(2)} · on ${isoDay(item.paidOn)}`;
}

module.exports = { validate, describe };
