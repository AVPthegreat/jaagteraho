'use strict';
const { NotFound } = require('./errors');
// An in-memory store with the same shape as a database table.
class Store {
  constructor(name) { this.name = name; this.rows = new Map(); this.nextId = 1; }
  add(row) { row.id = this.nextId++; this.rows.set(row.id, row); return row; }
  get(id) {
    const row = this.rows.get(Number(id));
    if (!row) throw new NotFound(`${this.name} ${id} not found`);
    return row;
  }
  all() { return [...this.rows.values()]; }
}
module.exports = { Store };
