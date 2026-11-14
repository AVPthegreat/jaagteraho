'use strict';
const { parseDate } = require('../core/dates');
const { toMoney, total, average } = require('../core/money');
const repo = require('./repo');

// Business rules for kitchens.
function create(data) {
  const item = {
    name: String(data.name).trim(),
    rating: Number(data.rating),
    openedOn: parseDate(data.opened_on),
  };
  return repo.save(item);
}

function summary(items = repo.all()) {
  return {
    count: items.length,
    totalRating: items.reduce((s, i) => s + i.rating, 0),
  };
}

module.exports = { create, summary };
