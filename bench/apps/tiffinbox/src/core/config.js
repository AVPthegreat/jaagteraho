'use strict';
// Settings, read once at start-up.
const SETTINGS = { currency: 'INR', pageSize: 20, gstDefault: 5 };
function setting(name) {
  if (!(name in SETTINGS)) throw new Error(`unknown setting ${name}`);
  return SETTINGS[name];
}
module.exports = { SETTINGS, setting };
