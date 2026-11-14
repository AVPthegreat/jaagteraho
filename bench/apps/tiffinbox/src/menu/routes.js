'use strict';
const { setting } = require('../core/config');
const { AppError } = require('../core/errors');
const { requireFields, ok, fail, queryInt } = require('../core/http');
const { paginate } = require('../core/pagination');
const { describe } = require('./model');
const repo = require('./repo');
const service = require('./service');

// HTTP handlers for /api/menus.
function createMenu(request) {
  const body = request.body || {};
  try {
    requireFields(body, 'kitchen_id', 'dish', 'price', 'served_on');
    return ok(describe(service.create(body)), 201);
  } catch (error) {
    if (error instanceof AppError) return fail(error);
    throw error;
  }
}

function listMenus(request) {
  const page = queryInt(request, 'page', 1);
  const size = queryInt(request, 'size', setting('pageSize'));
  return ok(paginate(repo.all().map(describe), page, size));
}

const summaryMenus = () => ok(service.summary());

module.exports = {
  'POST /api/menus': createMenu,
  'GET /api/menus': listMenus,
  'GET /api/menus/summary': summaryMenus,
};
