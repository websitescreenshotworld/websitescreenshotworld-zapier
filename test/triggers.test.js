/* globals describe, it, expect, afterEach, beforeAll, afterAll */
'use strict';

const crypto = require('crypto');
const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const appTester = zapier.createAppTester(App);

const API = 'https://api.websitescreenshotworld.com';
const KEY = 'wsw_api_0123456789ab_c2VjcmV0X3ZhbHVlX2Zvcl90ZXN0cw';
const SECRET = 'whsec_test_secret_for_the_trigger';

const sign = (body, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

const delivery = (envelope, header) => {
  const content = JSON.stringify(envelope);
  return {
    authData: { instant_snap_api_key: KEY },
    inputData: {},
    subscribeData: { id: 'endpoint-1', signing_secret: SECRET },
    cleanedRequest: envelope,
    rawRequest: { method: 'POST', headers: { 'Http-X-Wsw-Signature': header || sign(content) }, content },
  };
};

const SUCCEEDED = require('../lib/samples.json')['capture.succeeded'].auto_schedule;

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
// Each test file loads its own copy of nock; restoring lets the next file's copy intercept again.
afterAll(() => {
  nock.enableNetConnect();
  nock.restore();
});

describe('instant triggers', () => {
  it('subscribes by adding an endpoint for the one event, and keeps its id and secret', async () => {
    const scope = nock(API, { reqheaders: { 'x-api-key': KEY } })
      .post('/instant-snap/v1/webhook-endpoints', {
        url: 'https://hooks.zapier.com/hooks/standard/1/abc/',
        events: ['capture.succeeded'],
        name: 'Zapier: Capture Succeeded',
        product: 'auto_schedule',
      })
      .reply(201, { success: true, id: 'endpoint-1', signing_secret: SECRET, has_own_secret: true });

    const result = await appTester(App.triggers.capture_succeeded.operation.performSubscribe, {
      authData: { instant_snap_api_key: KEY },
      inputData: { product: 'auto_schedule' },
      targetUrl: 'https://hooks.zapier.com/hooks/standard/1/abc/',
    });

    expect(result).toEqual({ id: 'endpoint-1', signing_secret: SECRET });
    scope.done();
  });

  it('unsubscribes by deleting the endpoint, and an endpoint already gone is fine', async () => {
    const scope = nock(API)
      .delete('/instant-snap/v1/webhook-endpoints/endpoint-1')
      .reply(404, { success: false, error_code: 'webhook_endpoint_not_found', error_message: 'gone' });

    await appTester(App.triggers.capture_succeeded.operation.performUnsubscribe, {
      authData: { instant_snap_api_key: KEY },
      subscribeData: { id: 'endpoint-1', signing_secret: SECRET },
    });
    scope.done();
  });

  it('turns a signed delivery into one flat record', async () => {
    const records = await appTester(App.triggers.capture_succeeded.operation.perform, delivery(SUCCEEDED));

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(SUCCEEDED.id);
    expect(records[0].event).toBe('capture.succeeded');
    expect(records[0].capture_id).toBe(SUCCEEDED.data.id);
    expect(records[0].schedule_name).toBe('Pricing page');
  });

  it('drops a delivery whose signature does not match', async () => {
    const records = await appTester(
      App.triggers.capture_succeeded.operation.perform,
      delivery(SUCCEEDED, sign('something else')),
    );
    expect(records).toEqual([]);
  });

  it('drops a delivery signed with another secret, such as the organization secret', async () => {
    const records = await appTester(
      App.triggers.capture_succeeded.operation.perform,
      delivery(SUCCEEDED, sign(JSON.stringify(SUCCEEDED), 'whsec_some_other_secret')),
    );
    expect(records).toEqual([]);
  });

  it('ignores an event the trigger is not for', async () => {
    const failed = { ...SUCCEEDED, type: 'capture.failed' };
    const records = await appTester(App.triggers.capture_succeeded.operation.perform, delivery(failed));
    expect(records).toEqual([]);
  });

  it('respects the product filter', async () => {
    const bundle = delivery(SUCCEEDED);
    bundle.inputData = { product: 'instant_snap' };
    const records = await appTester(App.triggers.capture_succeeded.operation.perform, bundle);
    expect(records).toEqual([]);
  });

  it('offers an Instant Snap capture file to the next step', async () => {
    const instant = require('../lib/samples.json')['capture.succeeded'].instant_snap;
    const records = await appTester(App.triggers.capture_succeeded.operation.perform, delivery(instant));
    expect(typeof records[0].file).toBe('string');
    expect(records[0].file).toContain('hydrate');
  });

  it('shows the sample of the product the Zap picked', async () => {
    const list = (product) =>
      appTester(App.triggers.capture_succeeded.operation.performList, {
        authData: { instant_snap_api_key: KEY },
        inputData: product ? { product } : {},
      });

    const instant = await list('instant_snap');
    expect(instant[0].product).toBe('instant_snap');
    // Instant Snap events name their page since API 1.3.0, as Auto Schedule events always have.
    expect(instant[0].url).toBe('https://example.com/pricing');
    expect(instant[0].schedule_id).toBeUndefined();

    const scheduled = await list('auto_schedule');
    expect(scheduled[0].product).toBe('auto_schedule');
    expect(scheduled[0].url).toBeTruthy();

    expect((await list())[0].product).toBe('auto_schedule');
  });

  it('offers only the fields both products send when no product is picked', async () => {
    const samplesJson = require('../lib/samples.json');
    const { EVENTS } = require('../triggers/events');
    for (const definition of EVENTS) {
      const byProduct = samplesJson[definition.event] || {};
      if (!byProduct.auto_schedule || !byProduct.instant_snap) continue;

      const sample = App.triggers[definition.key].operation.sample;
      const instantKeys = Object.keys(byProduct.instant_snap.data).map((k) => (k === 'id' ? 'capture_id' : k));
      for (const name of ['schedule_id', 'schedule_name', 'sitemap_run_id']) {
        expect(sample).not.toHaveProperty(name);
      }
      for (const name of Object.keys(sample).filter((k) => !['id', 'event', 'product', 'created_at'].includes(k))) {
        expect(instantKeys).toContain(name);
      }
    }
  });

  it('has sample data for every trigger in the shape of a real delivery', async () => {
    for (const trigger of Object.values(App.triggers)) {
      const list = await appTester(trigger.operation.performList, { authData: { instant_snap_api_key: KEY } });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBeTruthy();
      expect(list[0].event).toBeTruthy();
    }
  });
});
