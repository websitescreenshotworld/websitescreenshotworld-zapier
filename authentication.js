'use strict';

const { INSTANT_SNAP_BASE, AUTO_SCHEDULE_BASE } = require('./lib/api');

/**
 * Two API keys, because the two APIs have keys of their own. The Instant Snap key is required: it captures pages
 * and registers the instant triggers. The Auto Schedule key is optional and is needed only for Capture Scheduled
 * Page Now. The test asks each API whose key it is (GET /account, API 1.4.0), which costs nothing and checks each
 * key given; its answer names the connection.
 */
const test = async (z, bundle) => {
  const response = await z.request({ url: `${INSTANT_SNAP_BASE}/account` });

  if (bundle.authData.auto_schedule_api_key) {
    await z.request({ url: `${AUTO_SCHEDULE_BASE}/account` });
  }

  const { key_name, key_prefix, email } = response.data;
  return { key_name, key_prefix, email };
};

/**
 * What the connection is called in Zapier's account list, after the app's name: the creator's email and the key's
 * name, e.g. "you@example.com (Zapier)". Never the key or any part of it (Zapier check D003).
 */
const connectionLabel = (z, bundle) => {
  const { key_name: keyName, email } = bundle.inputData || {};
  if (email && keyName) return `${email} (${keyName})`;
  return email || keyName || '';
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
  connectionLabel,
};
