'use strict';
const { parseDate } = require('../core/dates');
const { toMoney, total, average } = require('../core/money');
const menuRepo = require('../menu/repo');
const repo = require('./repo');

// Business rules for orders.
function create(data) {
  const item = {
    menuId: Number(data.menu_id),
    plates: Number(data.plates),
    total: toMoney(data.total),
    placedOn: parseDate(data.placed_on),
  };
  menuRepo.find(item.menuId);
  return repo.save(item);
}

function summary(items = repo.all()) {
  return {
    count: items.length,
    totalTotal: total(items.map((i) => i.total)),
    averageTotal: average(items.map((i) => i.total)),
    totalPlates: items.reduce((s, i) => s + i.plates, 0),
  };
}

function perUnit(id) {
  const item = repo.find(id);
  return toMoney(item.total / item.plates);
}

module.exports = { create, summary, perUnit };
