'use strict';

const { INSTANT_SNAP_BASE, AUTO_SCHEDULE_BASE } = require('./lib/api');

/**
 * Two API keys, because the two APIs have keys of their own. The Instant Snap key is required: it captures pages
 * and registers the instant triggers. The Auto Schedule key is optional and is needed only for Capture Scheduled
 * Page Now. The test reads the organization's webhook endpoints, which costs nothing and checks each key given.
 */
const test = async (z, bundle) => {
  const response = await z.request({ url: `${INSTANT_SNAP_BASE}/webhook-endpoints` });

  if (bundle.authData.auto_schedule_api_key) {
    await z.request({ url: `${AUTO_SCHEDULE_BASE}/webhook-endpoints` });
  }

  return { webhook_endpoints: (response.data.items || []).length };
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'instant_snap_api_key',
      label: 'Instant Snap API Key',
      required: true,
      type: 'password',
      helpText:
        'In Website Screenshot World, open **Developer Tools > API Keys** and create a key for the Instant Snap API. It starts with `wsw_api_`. [How to create one](https://www.websitescreenshotworld.com/api-documentation/api-keys)',
    },
    {
      key: 'auto_schedule_api_key',
      label: 'Auto Schedule API Key',
      required: false,
      type: 'password',
      helpText:
        'Optional. Only for **Capture Scheduled Page Now**. Create it on the same page; it starts with `wsw_autoapi_`. [How to create one](https://www.websitescreenshotworld.com/api-documentation/api-keys)',
    },
  ],
  test,
};
