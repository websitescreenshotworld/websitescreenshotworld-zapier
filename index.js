'use strict';

const authentication = require('./authentication');
const { addApiKey, handleRefusals } = require('./lib/api');
const hydrators = require('./hydrators');
const { triggers } = require('./triggers/events');
const { creates: captureCreates } = require('./creates/capture');
const { definition: captureScheduledPage } = require('./creates/captureScheduledPage');

const byKey = (items) => Object.fromEntries(items.map((item) => [item.key, item]));

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  authentication,

  // Input arrives as typed; the actions read their own fields (D028).
  flags: { cleanInputData: false },

  beforeRequest: [addApiKey],
  afterResponse: [handleRefusals],

  hydrators: { captureFile: hydrators.captureFile },

  triggers: byKey(triggers),
  creates: byKey([...captureCreates, captureScheduledPage]),
  searches: {},
};
