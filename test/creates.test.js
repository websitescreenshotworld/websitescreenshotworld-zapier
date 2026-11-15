/* globals describe, it, expect, afterEach, beforeAll, afterAll */
'use strict';

const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { buildBody } = require('../creates/capture');
const { pageIdFrom } = require('../creates/captureScheduledPage');
const appTester = zapier.createAppTester(App);

const API = 'https://api.websitescreenshotworld.com';
const AUTO = 'https://autoapi.websitescreenshotworld.com';
const MEDIA = 'https://media.websitescreenshotworld.com';
const KEY = 'wsw_api_0123456789ab_c2VjcmV0X3ZhbHVlX2Zvcl90ZXN0cw';
const AUTO_KEY = 'wsw_autoapi_0123456789ab_c2VjcmV0X3ZhbHVlX2Zvcl90ZXN0cw';
const ID = '3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69';

const capture = (overrides = {}) => ({
  success: true,
  id: ID,
  status: 'succeeded',
  response_type: 'json',
  media_category: 'image',
  format: 'png',
  content_type: 'image/png',
  size_bytes: 10,
  width: 1920,
  height: 1080,
  duration_ms: 4210,
  page_http_status: 200,
  captured_at: '2026-09-26T10:30:04.512Z',
  final_url: null,
  media_sha256: 'ab',
  download_url: `${MEDIA}/s/x/0.png?e=1&s=abc`,
  expires_at: '2026-09-27T10:30:04.512Z',
  ...overrides,
});

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
// Each test file loads its own copy of nock; restoring lets the next file's copy intercept again.
afterAll(() => {
  nock.enableNetConnect();
  nock.restore();
});

describe('capture actions', () => {
  it('builds the request body in the API’s own names and leaves empty fields out', () => {
    expect(
      buildBody('take_screenshot', {
        url: ' https://example.com ',
        format: 'webp',
        full_page: 'true',
        viewport_width: '1440',
        block_ads: 'false',
        hide: '.chat',
      }),
    ).toEqual({
      url: 'https://example.com',
      response_type: 'json',
      media_category: 'image',
      format: 'webp',
      scroll_mode: 'scroll',
      viewport: { width: 1440 },
      block_ads: false,
      selectors: { hide: '.chat' },
    });
  });

  it('never makes a document PDF full page, which the API refuses', () => {
    expect(buildBody('create_pdf', { url: 'https://example.com', format: 'document_pdf', full_page: true }).scroll_mode)
      .toBeUndefined();
    expect(buildBody('create_pdf', { url: 'https://example.com', format: 'image_pdf', full_page: true }).scroll_mode)
      .toBe('scroll');
  });

  it('takes a screenshot asynchronously, reads it back, and offers the file', async () => {
    const scope = nock(API, { reqheaders: { 'x-api-key': KEY } })
      .post('/instant-snap/v1/captures', (body) => body.async === true && body.callback_url === undefined)
      .reply(202, capture({ status: 'queued', download_url: null }))
      .get(`/instant-snap/v1/captures/${ID}`)
      .reply(200, capture());

    const result = await appTester(App.creates.take_screenshot.operation.perform, {
      authData: { instant_snap_api_key: KEY },
      inputData: { url: 'https://example.com' },
    });

    expect(result.id).toBe(ID);
    expect(result.status).toBe('succeeded');
    expect(result.file).toContain('hydrate');
    expect(result.download_url).toBeUndefined();
    scope.done();
  });

  it('reports a failed capture as an error, with the API’s code', async () => {
    nock(API)
      .post('/instant-snap/v1/captures')
      .reply(202, capture({ status: 'failed', error_code: 'capture_failed', page_http_status: 403 }));

    await expect(
      appTester(App.creates.take_screenshot.operation.perform, {
        authData: { instant_snap_api_key: KEY },
        inputData: { url: 'https://example.com' },
      }),
    ).rejects.toThrow(/capture_failed/);
  });

  it('returns page content as text, fetching the link without the API key', async () => {
    nock(API)
      .post('/instant-snap/v1/captures')
      .reply(202, capture({ media_category: 'content', format: 'markdown', content_type: 'text/markdown' }));
    const media = nock(MEDIA, { badheaders: ['x-api-key'] }).get('/s/x/0.png').query(true).reply(200, '# Hello');

    const result = await appTester(App.creates.get_page_content.operation.perform, {
      authData: { instant_snap_api_key: KEY },
      inputData: { url: 'https://example.com', format: 'markdown' },
    });

    expect(result.content).toBe('# Hello');
    media.done();
  });

  it('records a video with a callback and finishes it when the callback arrives', async () => {
    nock(API)
      .post('/instant-snap/v1/captures', (body) => body.async === true && typeof body.callback_url === 'string')
      .reply(202, capture({ status: 'queued', media_category: 'video', format: 'mp4' }));

    const started = await appTester(App.creates.record_video.operation.perform, {
      authData: { instant_snap_api_key: KEY },
      inputData: { url: 'https://example.com' },
    });
    expect(started).toEqual({ id: ID, status: 'queued', url: 'https://example.com' });

    nock(API).get(`/instant-snap/v1/captures/${ID}`).reply(200, capture({ media_category: 'video', format: 'mp4' }));
    const finished = await appTester(App.creates.record_video.operation.performResume, {
      authData: { instant_snap_api_key: KEY },
      outputData: started,
      // The callback body is only a signal; the capture is read again with the key.
      cleanedRequest: { type: 'capture.succeeded', data: { id: 'not-trusted' } },
    });
    expect(finished.status).toBe('succeeded');
    expect(finished.file).toContain('hydrate');
  });

  it('turns an invalid key into an authentication error and a 429 into a throttle', async () => {
    nock(API)
      .post('/instant-snap/v1/captures')
      .reply(401, { success: false, error_code: 'api_key_invalid', error_message: 'The API key is invalid.' });
    await expect(
      appTester(App.creates.take_screenshot.operation.perform, {
        authData: { instant_snap_api_key: KEY },
        inputData: { url: 'https://example.com' },
      }),
    ).rejects.toThrow(/AuthenticationError/);

    nock(API)
      .post('/instant-snap/v1/captures')
      .reply(
        429,
        { success: false, error_code: 'rate_limited', error_message: 'Slow down.', retry_after_seconds: 7 },
        { 'Retry-After': '7' },
      );
    await expect(
      appTester(App.creates.take_screenshot.operation.perform, {
        authData: { instant_snap_api_key: KEY },
        inputData: { url: 'https://example.com' },
      }),
    ).rejects.toThrow(/"delay":7/);
  });
});

describe('capture scheduled page now', () => {
  it('reads a page id from the trigger-now URL the app copies', () => {
    expect(pageIdFrom(`${AUTO}/auto-schedule/v1/web-pages/8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77/trigger-now`)).toBe(
      '8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77',
    );
    expect(pageIdFrom('8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77')).toBe('8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77');
    expect(pageIdFrom('nope')).toBeNull();
  });

  it('triggers with the Auto Schedule key, never the Instant Snap key', async () => {
    const scope = nock(AUTO, { reqheaders: { 'x-api-key': AUTO_KEY } })
      .post('/auto-schedule/v1/web-pages/8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77/trigger-now')
      .reply(200, { success: true, status: 'triggered', web_page_id: '8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77' });

    const result = await appTester(App.creates.capture_scheduled_page.operation.perform, {
      authData: { instant_snap_api_key: KEY, auto_schedule_api_key: AUTO_KEY },
      inputData: { web_page: '8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77' },
    });
    expect(result.status).toBe('triggered');
    expect(result.success).toBeUndefined();
    scope.done();
  });

  it('says what is missing when there is no Auto Schedule key', async () => {
    await expect(
      appTester(App.creates.capture_scheduled_page.operation.perform, {
        authData: { instant_snap_api_key: KEY },
        inputData: { web_page: '8f14e45f-ceea-467a-9d0b-2c0b6f1a9e77' },
      }),
    ).rejects.toThrow(/Auto Schedule API key/);
  });
});

describe('connection test', () => {
  const account = {
    success: true,
    key_name: 'Zapier',
    key_prefix: '0123456789ab',
    product: 'instant_snap',
    email: 'you@example.com',
  };

  it('checks each key against its own API', async () => {
    const instant = nock(API, { reqheaders: { 'x-api-key': KEY } })
      .get('/instant-snap/v1/account')
      .reply(200, account);
    const auto = nock(AUTO, { reqheaders: { 'x-api-key': AUTO_KEY } })
      .get('/auto-schedule/v1/account')
      .reply(200, { ...account, product: 'auto_schedule' });

    const result = await appTester(App.authentication.test, {
      authData: { instant_snap_api_key: KEY, auto_schedule_api_key: AUTO_KEY },
    });
    instant.done();
    auto.done();
    expect(result).toEqual({ key_name: 'Zapier', key_prefix: '0123456789ab', email: 'you@example.com' });
  });

  it('names the connection by email and key name, never by the key', async () => {
    const label = App.authentication.connectionLabel;

    expect(label(null, { inputData: { key_name: 'Zapier', email: 'you@example.com' } })).toBe(
      'you@example.com (Zapier)',
    );
    expect(label(null, { inputData: { key_name: 'Zapier', email: null } })).toBe('Zapier');
    expect(label(null, { inputData: { key_name: null, email: 'you@example.com' } })).toBe('you@example.com');
    expect(label(null, { inputData: {}, authData: { instant_snap_api_key: KEY } })).not.toContain('wsw_api_');
  });
});
