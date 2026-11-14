'use strict';
const { Store } = require('../core/store');
const { validate } = require('./model');

const RIDERS = new Store('rider');

const save = (item) => RIDERS.add(validate(item));
const find = (id) => RIDERS.get(id);
const all = () => RIDERS.all();

module.exports = { save, find, all };
