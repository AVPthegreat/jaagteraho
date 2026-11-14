'use strict';
const { Store } = require('../core/store');
const { validate } = require('./model');

const MENUS = new Store('menu');

const save = (item) => MENUS.add(validate(item));
const find = (id) => MENUS.get(id);
const all = () => MENUS.all();

module.exports = { save, find, all };
