'use strict';
const { parseDate } = require('../core/dates');
const { toMoney, total, average } = require('../core/money');
const riderRepo = require('../rider/repo');
const repo = require('./repo');

// Business rules for payouts.
function create(data) {
  const item = {
    riderId: Number(data.rider_id),
    amount: toMoney(data.amount),
    paidOn: parseDate(data.paid_on),
  };
  riderRepo.find(item.riderId);
  return repo.save(item);
}

function summary(items = repo.all()) {
  return {
    count: items.length,
    totalAmount: total(items.map((i) => i.amount)),
    averageAmount: average(items.map((i) => i.amount)),
  };
}

module.exports = { create, summary };
