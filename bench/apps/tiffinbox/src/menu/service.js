'use strict';
const { parseDate } = require('../core/dates');
const { toMoney, total, average } = require('../core/money');
const kitchenRepo = require('../kitchen/repo');
const repo = require('./repo');

// Business rules for menus.
function create(data) {
  const item = {
    kitchenId: Number(data.kitchen_id),
    dish: String(data.dish).trim(),
    price: toMoney(data.price),
    servedOn: parseDate(data.served_on),
  };
  kitchenRepo.find(item.kitchenId);
  return repo.save(item);
}

function summary(items = repo.all()) {
  return {
    count: items.length,
    totalPrice: total(items.map((i) => i.price)),
    averagePrice: average(items.map((i) => i.price)),
  };
}

module.exports = { create, summary };
