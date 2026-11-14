'use strict';
const { setting } = require('../core/config');
const { AppError } = require('../core/errors');
const { requireFields, ok, fail, queryInt } = require('../core/http');
const { paginate } = require('../core/pagination');
const { describe } = require('./model');
const repo = require('./repo');
const service = require('./service');

// HTTP handlers for /api/riders.
function createRider(request) {
  const body = request.body || {};
  try {
    requireFields(body, 'name', 'trips', 'joined_on');
    return ok(describe(service.create(body)), 201);
  } catch (error) {
    if (error instanceof AppError) return fail(error);
    throw error;
  }
}

function listRiders(request) {
  const page = queryInt(request, 'page', 1);
  const size = queryInt(request, 'size', setting('pageSize'));
  return ok(paginate(repo.all().map(describe), page, size));
}

const summaryRiders = () => ok(service.summary());

module.exports = {
  'POST /api/riders': createRider,
  'GET /api/riders': listRiders,
  'GET /api/riders/summary': summaryRiders,
};
