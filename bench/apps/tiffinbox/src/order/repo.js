'use strict';
const { Store } = require('../core/store');
const { validate } = require('./model');

const ORDERS = new Store('order');

const save = (item) => ORDERS.add(validate(item));
const find = (id) => ORDERS.get(id);
const all = () => ORDERS.all();

module.exports = { save, find, all };
