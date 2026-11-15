'use strict';

const { INSTANT_SNAP_BASE } = require('../lib/api');
const { verifySignature, rawHeader } = require('../lib/signature');
const samples = require('../lib/samples.json');
const hydrators = require('../hydrators');

/**
 * One instant trigger per webhook event. Turning a Zap on adds a webhook endpoint to the organization through the
 * webhook endpoints API (with the Instant Snap key); turning it off deletes it. Each endpoint has a signing secret
 * of its own, kept in the subscription, and every delivery is checked against it before the Zap runs: a request
 * that is not signed by Website Screenshot World is dropped.
 */
const EVENTS = [
  {
    key: 'capture_succeeded',
    event: 'capture.succeeded',
    noun: 'Capture',
    label: 'Capture Succeeded',
    description: 'Triggers when a capture finishes successfully, from a schedule or from the Instant Snap API.',
    products: true,
  },
  {
    key: 'capture_failed',
    event: 'capture.failed',
    noun: 'Capture',
    label: 'Capture Failed',
    description: 'Triggers when a capture fails, from a schedule or from the Instant Snap API.',
    products: true,
  },
  {
    key: 'page_changed',
    event: 'capture.changed',
    noun: 'Change',
    label: 'Page Changed',
    description:
      'Triggers when a scheduled page looks different from its previous capture, with the change percentage.',
  },
  {
    key: 'delivery_completed',
    event: 'delivery.completed',
    noun: 'Delivery',
    label: 'Delivery Completed',
    description: 'Triggers when a capture has been delivered to your cloud storage (S3, Google Drive or Dropbox).',
  },
  {
    key: 'schedule_paused',
    event: 'schedule.paused',
    noun: 'Schedule',
    label: 'Schedule Paused',
    description: 'Triggers when a schedule is paused, for example because the plan quota is used up.',
  },
  {
    key: 'sitemap_run_completed',
    event: 'sitemap_run.completed',
    noun: 'Sitemap Run',
    label: 'Sitemap Run Completed',
    description: 'Triggers when every page of a sitemap schedule run has been captured or skipped.',
  },
];

const PRODUCT_FIELD = {
  key: 'product',
  label: 'Product',
  required: false,
  choices: { auto_schedule: 'Auto Schedule (scheduled pages)', instant_snap: 'Instant Snap API' },
  helpText: 'Only this product’s captures. Leave empty for both.',
};

/** The delivery as a flat record: the event's own id (stable across retries), its type, and its data. */
const toRecord = (z, envelope) => {
  const data = envelope.data || {};
  const record = {
    id: envelope.id,
    event: envelope.type,
    product: envelope.product,
    created_at: envelope.created_at,
  };

  for (const [name, value] of Object.entries(data)) {
    record[name === 'id' ? 'capture_id' : name] = value;
  }

  // An Instant Snap capture that kept its file can hand it to the next step; a scheduled capture's file stays in
  // the app and in the schedule's own delivery destinations.
  if (
    z &&
    envelope.type === 'capture.succeeded' &&
    envelope.product === 'instant_snap' &&
    data.response_type === 'json' &&
    data.id
  ) {
    record.file = z.dehydrateFile(hydrators.captureFile, { captureId: data.id });
  }

  return record;
};

/**
 * The documented example for this event, from the product the Zap picked. The two products send different fields
 * (an Instant Snap capture has no schedule), and a sample from the wrong one invites mapping a field the
 * real deliveries never carry. With no product picked, only the fields both products send (15 Nov 2026): Zapier's
 * validator checks that every field of a trigger's sample appears in its real deliveries, and an Auto Schedule
 * sample offered schedule_id, schedule_name and sitemap_run_id, which an Instant Snap capture never carries.
 */
const sampleFor = (definition, product) => {
  const byProduct = samples[definition.event];
  if (product && byProduct[product]) return byProduct[product];

  const scheduled = byProduct.auto_schedule;
  const instant = byProduct.instant_snap;
  if (!scheduled || !instant) return scheduled || instant;

  const shared = Object.fromEntries(
    Object.entries(scheduled.data || {}).filter(([name]) => Object.prototype.hasOwnProperty.call(instant.data || {}, name))
  );
  return { ...scheduled, data: shared };
};

const makeTrigger = (definition) => {
  const subscribe = async (z, bundle) => {
    const body = {
      url: bundle.targetUrl,
      events: [definition.event],
      name: `Zapier: ${definition.label}`,
    };
    if (definition.products && bundle.inputData.product) body.product = bundle.inputData.product;

    const response = await z.request({ url: `${INSTANT_SNAP_BASE}/webhook-endpoints`, method: 'POST', body });

    // Kept by Zapier as bundle.subscribeData: the id to delete it with, and the secret to check deliveries with.
    return { id: response.data.id, signing_secret: response.data.signing_secret };
  };

  const unsubscribe = async (z, bundle) => {
    const id = bundle.subscribeData && bundle.subscribeData.id;
    if (!id) return {};

    // Already gone (deleted in the app) is as good as deleted.
    const response = await z.request({
      url: `${INSTANT_SNAP_BASE}/webhook-endpoints/${encodeURIComponent(id)}`,
      method: 'DELETE',
      skipThrowForStatus: true,
    });
    if (response.status >= 400 && response.status !== 404) response.throwForStatus();

    return {};
  };

  const perform = (z, bundle) => {
    const secret = bundle.subscribeData && bundle.subscribeData.signing_secret;
    const raw = bundle.rawRequest;
    const check = verifySignature(rawHeader(raw, 'X-Wsw-Signature'), raw && raw.content, secret);

    if (!check.valid) {
      z.console.log(`Dropped a delivery that failed the signature check: ${check.reason}`);
      return [];
    }

    const envelope = bundle.cleanedRequest || {};
    if (envelope.type !== definition.event) return [];
    if (definition.products && bundle.inputData.product && envelope.product !== bundle.inputData.product) return [];

    return [toRecord(z, envelope)];
  };

  // Sample data for the Zap editor. There is no API to list past deliveries, so these are the documented
  // examples, in exactly the shape a real delivery has.
  const performList = (z, bundle) => {
    const product = definition.products && bundle && bundle.inputData ? bundle.inputData.product : undefined;
    return [toRecord(null, sampleFor(definition, product))];
  };

  return {
    key: definition.key,
    noun: definition.noun,
    display: { label: definition.label, description: definition.description },
    operation: {
      type: 'hook',
      inputFields: definition.products ? [PRODUCT_FIELD] : [],
      performSubscribe: subscribe,
      performUnsubscribe: unsubscribe,
      perform,
      performList,
      sample: toRecord(null, sampleFor(definition)),
    },
  };
};

const triggers = EVENTS.map(makeTrigger);

module.exports = { triggers, EVENTS, toRecord };
