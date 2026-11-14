'use strict';
// Money helpers. Amounts are rupees, kept as numbers with two decimals.
function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`not an amount: ${value}`);
  return Math.round(n * 100) / 100;
}
function total(amounts) {
  return toMoney(amounts.reduce((sum, a) => sum + toMoney(a), 0));
}
function average(amounts) {
  return amounts.length ? toMoney(total(amounts) / amounts.length) : 0;
}
function addRate(amount, rate) {
  return toMoney(toMoney(amount) * (1 + Number(rate) / 100));
}
module.exports = { toMoney, total, average, addRate };
