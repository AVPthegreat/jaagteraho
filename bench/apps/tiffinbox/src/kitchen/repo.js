'use strict';
const { Store } = require('../core/store');
const { validate } = require('./model');

const KITCHENS = new Store('kitchen');

const save = (item) => KITCHENS.add(validate(item));
const find = (id) => KITCHENS.get(id);
const all = () => KITCHENS.all();

module.exports = { save, find, all };
