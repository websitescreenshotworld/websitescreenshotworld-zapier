'use strict';

const { AUTO_SCHEDULE_BASE } = require('../lib/api');

/**
 * Capture Scheduled Page Now: runs a page you schedule in Auto Schedule straight away, with its own settings,
 * comparison and deliveries. Needs the Auto Schedule key in the connection. The result arrives through the
 * Capture Succeeded trigger, like every scheduled capture.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts the page id or the whole trigger-now URL the app's Trigger API badge copies. */
const pageIdFrom = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/web-pages\/([0-9a-f-]{36})\/trigger-now/i);
  const id = match ? match[1] : text;
  return UUID.test(id) ? id : null;
};

const perform = async (z, bundle) => {
  if (!bundle.authData.auto_schedule_api_key) {
    throw new z.errors.Error(
      'This action needs an Auto Schedule API key. Reconnect Website Screenshot World and fill in the Auto Schedule API Key field.',
      'auto_schedule_key_missing',
    );
  }

  const webPageId = pageIdFrom(bundle.inputData.web_page);
  if (!webPageId) {
    throw new z.errors.Error(
      'The scheduled page is not a page ID or a trigger-now URL. Copy it from the Trigger API badge of the page in the app.',
      'web_page_id_invalid',
    );
  }

  const response = await z.request({
    url: `${AUTO_SCHEDULE_BASE}/web-pages/${webPageId}/trigger-now`,
    method: 'POST',
  });

  const { success, ...result } = response.data;
  return result;
};

const definition = {
  key: 'capture_scheduled_page',
  noun: 'Scheduled Capture',
  display: {
    label: 'Capture Scheduled Page Now',
    description:
      'Runs a page you schedule in Auto Schedule straight away, with its own settings, comparison and deliveries.',
  },
  operation: {
    inputFields: [
      {
        key: 'web_page',
        label: 'Scheduled Page',
        required: true,
        type: 'string',
        helpText:
          'The page’s ID, or the whole URL the **Trigger API** badge of the page copies in the app. Its result arrives through the **Capture Succeeded** trigger.',
      },
    ],
    perform,
    sample: {
      status: 'triggered',
      web_page_id: '8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77',
      triggered_by: 'api',
      triggered_at: '2026-09-01T09:14:22.000Z',
      message: 'A capture has been started.',
    },
    outputFields: [
      { key: 'status', label: 'Status' },
      { key: 'web_page_id', label: 'Scheduled Page ID' },
      { key: 'triggered_by', label: 'Triggered By' },
      { key: 'triggered_at', label: 'Triggered At', type: 'datetime' },
      { key: 'message', label: 'Message' },
    ],
  },
};

module.exports = { definition, pageIdFrom };
