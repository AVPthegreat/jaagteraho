'use strict';
const { Store } = require('../core/store');
const { validate } = require('./model');

const PAYOUTS = new Store('payout');

const save = (item) => PAYOUTS.add(validate(item));
const find = (id) => PAYOUTS.get(id);
const all = () => PAYOUTS.all();

module.exports = { save, find, all };
