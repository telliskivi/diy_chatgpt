'use strict';

module.exports = {
  name: 'get_datetime',
  description: 'Get the current date and time in ISO 8601 format',
  parameters: { type: 'object', properties: {} },
  execute(_args) {
    return new Date().toISOString();
  },
};
