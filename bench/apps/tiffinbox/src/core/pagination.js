'use strict';
// Splits long lists into pages.
function paginate(items, page = 1, size = 20) {
  page = Math.max(1, page);
  size = Math.max(1, Math.min(100, size));
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, size, total: items.length };
}
module.exports = { paginate };
