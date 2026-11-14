'use strict';
const { setting } = require('../core/config');
const { AppError } = require('../core/errors');
const { requireFields, ok, fail, queryInt } = require('../core/http');
const { paginate } = require('../core/pagination');
const { describe } = require('./model');
const repo = require('./repo');
const service = require('./service');

// HTTP handlers for /api/payouts.
function createPayout(request) {
  const body = request.body || {};
  try {
    requireFields(body, 'rider_id', 'amount', 'paid_on');
    return ok(describe(service.create(body)), 201);
  } catch (error) {
    if (error instanceof AppError) return fail(error);
    throw error;
  }
}

function listPayouts(request) {
  const page = queryInt(request, 'page', 1);
  const size = queryInt(request, 'size', setting('pageSize'));
  return ok(paginate(repo.all().map(describe), page, size));
}

const summaryPayouts = () => ok(service.summary());

module.exports = {
  'POST /api/payouts': createPayout,
  'GET /api/payouts': listPayouts,
  'GET /api/payouts/summary': summaryPayouts,
};
