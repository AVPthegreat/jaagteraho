'use strict';
const { NotFound } = require('./core/errors');
const { fail } = require('./core/http');

// Tiffin deliveries: kitchens, menus, orders, riders and payouts. Routes every request to its handler.
const ROUTES = Object.assign({},
  require('./kitchen/routes'),
  require('./menu/routes'),
  require('./order/routes'),
  require('./rider/routes'),
  require('./payout/routes'),
);

function handle(method, path, body = {}, query = {}) {
  const handler = ROUTES[`${method} ${path}`];
  if (!handler) return fail(new NotFound(`no route ${method} ${path}`));
  return handler({ body, query, path });
}

module.exports = { handle, ROUTES };
