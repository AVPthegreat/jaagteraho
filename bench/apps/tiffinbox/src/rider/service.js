'use strict';
const { parseDate } = require('../core/dates');
const { toMoney, total, average } = require('../core/money');
const repo = require('./repo');

// Business rules for riders.
function create(data) {
  const item = {
    name: String(data.name).trim(),
    trips: Number(data.trips),
    joinedOn: parseDate(data.joined_on),
  };
  return repo.save(item);
}

function summary(items = repo.all()) {
  return {
    count: items.length,
    totalTrips: items.reduce((s, i) => s + i.trips, 0),
  };
}

module.exports = { create, summary };
