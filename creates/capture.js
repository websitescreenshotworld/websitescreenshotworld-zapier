'use strict';

const { INSTANT_SNAP_BASE } = require('../lib/api');
const hydrators = require('../hydrators');

/**
 * The four capture actions over the Instant Snap API: Take Screenshot, Create PDF, Record Video and Get Page
 * Content.
 *
 * A Zapier step has 30 seconds. A screenshot, a PDF or page content is nearly always done well inside that, so the
 * capture is started with `async: true` and read back until it finishes, within a 22-second budget; this works on
 * every plan. A video takes longer, so it is started with a Zapier callback URL instead: the step waits and the
 * capture's webhook resumes it (webhooks are in every paid plan, and video is only on paid plans). On resume the
 * capture is read again with the API key - the callback body is only a signal, so a forged callback can do nothing
 * but make the step read its own capture.
 */
const POLL_BUDGET_MS = 22000;
const POLL_INTERVAL_MS = 2000;

const FINAL_OK = new Set(['succeeded']);
const FINAL_FAILED = new Set(['failed', 'timed_out', 'expired']);

const asBoolean = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return ['true', 'yes', '1'].includes(String(value).toLowerCase());
};

const asInteger = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
};

const COMMON_FIELDS = [
  {
    key: 'url',
    label: 'URL',
    required: true,
    type: 'string',
    helpText: 'The full address of the page to capture, such as `https://example.com/pricing`.',
  },
  {
    key: 'device_category',
    label: 'Device',
    required: false,
    choices: { desktop: 'Desktop', mobile: 'Mobile (iPhone 13 unless a device is named)' },
    default: 'desktop',
  },
  {
    key: 'emulated_device',
    label: 'Emulated Device',
    required: false,
    type: 'string',
    helpText: 'A device name such as "iPhone 15 Pro" or "Pixel 7", for a mobile capture.',
  },
  { key: 'viewport_width', label: 'Viewport Width', required: false, type: 'integer', helpText: 'In pixels, 250 to 7680. Default 1920.' },
  { key: 'viewport_height', label: 'Viewport Height', required: false, type: 'integer', helpText: 'In pixels, 250 to 7680. Default 1080.' },
  { key: 'block_ads', label: 'Block Ads', required: false, type: 'boolean', default: 'true' },
  {
    key: 'block_pop_ups',
    label: 'Block Pop-ups and Cookie Banners',
    required: false,
    type: 'boolean',
    default: 'true',
  },
  {
    key: 'hide',
    label: 'Hide Elements',
    required: false,
    type: 'string',
    helpText: 'Comma-separated CSS selectors of elements to hide before the capture, such as `.chat-widget, #banner`.',
  },
  {
    key: 'click',
    label: 'Click Element',
    required: false,
    type: 'string',
    helpText: 'A CSS selector to click before the capture, such as a "Load more" button.',
  },
  { key: 'locale', label: 'Locale', required: false, type: 'string', helpText: 'Such as `en-GB` or `de-DE`.' },
  { key: 'time_zone', label: 'Time Zone', required: false, type: 'string', helpText: 'Such as `Europe/London`.' },
  {
    key: 'proxy_country',
    label: 'Proxy Country',
    required: false,
    type: 'string',
    helpText: 'Capture from this country, such as `Germany`. Needs a plan with proxy locations.',
  },
];

const OPERATIONS = {
  take_screenshot: {
    noun: 'Screenshot',
    label: 'Take Screenshot',
    description: 'Takes a screenshot of a web page as PNG, JPEG, WebP or TIFF.',
    mediaCategory: 'image',
    fields: [
      {
        key: 'format',
        label: 'Format',
        required: false,
        choices: { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', tiff: 'TIFF' },
        default: 'png',
      },
      {
        key: 'full_page',
        label: 'Full Page',
        required: false,
        type: 'boolean',
        default: 'false',
        helpText: 'Capture the whole page from top to bottom, not just the visible part.',
      },
      {
        key: 'xpath',
        label: 'Element XPath',
        required: false,
        type: 'string',
        helpText: 'Capture only the element this XPath selects, such as `//main`.',
      },
    ],
  },
  create_pdf: {
    noun: 'PDF',
    label: 'Create PDF',
    description: 'Creates a PDF of a web page, with selectable text or looking exactly like the page on screen.',
    mediaCategory: 'pdf',
    fields: [
      {
        key: 'format',
        label: 'PDF Type',
        required: false,
        choices: {
          document_pdf: 'Document (selectable, searchable text)',
          image_pdf: 'Image (looks exactly like the screen)',
        },
        default: 'document_pdf',
      },
      {
        key: 'full_page',
        label: 'Full Page',
        required: false,
        type: 'boolean',
        default: 'false',
        helpText: 'For an image PDF only: the whole page in one PDF.',
      },
    ],
  },
  record_video: {
    noun: 'Video',
    label: 'Record Video',
    description: 'Records a video of a web page scrolling from top to bottom, on plans that include video.',
    mediaCategory: 'video',
    fields: [
      {
        key: 'format',
        label: 'Format',
        required: false,
        choices: { mp4: 'MP4', webm: 'WebM', mov: 'MOV', gif: 'GIF' },
        default: 'mp4',
      },
    ],
  },
  get_page_content: {
    noun: 'Page Content',
    label: 'Get Page Content',
    description:
      'Reads a web page’s main content as Markdown or plain text, without navigation, cookie banners or scripts.',
    mediaCategory: 'content',
    fields: [
      {
        key: 'format',
        label: 'Format',
        required: false,
        choices: { markdown: 'Markdown', text: 'Plain text' },
        default: 'markdown',
      },
    ],
  },
};

/** The request body, in the API's own field names. Fields left empty keep the API's defaults. */
const buildBody = (operation, input) => {
  const definition = OPERATIONS[operation];
  const body = {
    url: String(input.url || '').trim(),
    response_type: 'json',
    media_category: definition.mediaCategory,
  };

  if (input.format) body.format = input.format;

  const fullPage = asBoolean(input.full_page);
  if (operation === 'take_screenshot' && fullPage !== undefined) body.scroll_mode = fullPage ? 'scroll' : 'viewport';
  // A document PDF is written one screen at a time and is never a scrolling capture; the API refuses it.
  if (operation === 'create_pdf' && fullPage && (input.format || 'document_pdf') === 'image_pdf') {
    body.scroll_mode = 'scroll';
  }

  if (input.device_category) body.device_category = input.device_category;
  if (input.emulated_device) body.emulated_device = String(input.emulated_device).trim();

  const viewport = {};
  const width = asInteger(input.viewport_width);
  const height = asInteger(input.viewport_height);
  if (width !== undefined) viewport.width = width;
  if (height !== undefined) viewport.height = height;
  if (Object.keys(viewport).length > 0) body.viewport = viewport;

  const blockAds = asBoolean(input.block_ads);
  const blockPopUps = asBoolean(input.block_pop_ups);
  if (blockAds !== undefined) body.block_ads = blockAds;
  if (blockPopUps !== undefined) body.block_pop_ups = blockPopUps;

  const selectors = {};
  if (input.xpath && operation === 'take_screenshot') selectors.xpath = String(input.xpath).trim();
  if (input.hide) selectors.hide = String(input.hide).trim();
  if (input.click) selectors.click = String(input.click).trim();
  if (Object.keys(selectors).length > 0) body.selectors = selectors;

  if (input.locale) body.locale = String(input.locale).trim();
  if (input.time_zone) body.time_zone = String(input.time_zone).trim();
  if (input.proxy_country) body.proxy = { country: String(input.proxy_country).trim() };

  return body;
};

const readCapture = async (z, id) => {
  const response = await z.request({ url: `${INSTANT_SNAP_BASE}/captures/${encodeURIComponent(id)}` });
  return response.data;
};

const failure = (z, capture) =>
  new z.errors.Error(
    `The capture ${capture.status === 'timed_out' ? 'timed out' : capture.status}` +
      (capture.page_http_status ? ` (the page answered HTTP ${capture.page_http_status})` : '') +
      '. Failed captures are not charged.',
    capture.error_code || `capture_${capture.status}`,
  );

/** The step's output: the capture's details, and its file or text. */
const output = async (z, operation, capture, requestedUrl) => {
  const record = {
    id: capture.id,
    status: capture.status,
    url: requestedUrl,
    media_category: capture.media_category,
    format: capture.format,
    content_type: capture.content_type,
    size_bytes: capture.size_bytes,
    width: capture.width,
    height: capture.height,
    duration_ms: capture.duration_ms,
    page_http_status: capture.page_http_status,
    captured_at: capture.captured_at,
    final_url: capture.final_url,
    media_sha256: capture.media_sha256,
    expires_at: capture.expires_at,
  };

  if (operation === 'get_page_content') {
    const response = await z.request({ url: capture.download_url, skipThrowForStatus: false });
    record.content = response.content;
    return record;
  }

  // The file itself is fetched only when a later step uses it.
  record.file = z.dehydrateFile(hydrators.captureFile, { captureId: capture.id });
  return record;
};

const finish = async (z, operation, capture, requestedUrl) => {
  if (FINAL_FAILED.has(capture.status)) throw failure(z, capture);
  if (!FINAL_OK.has(capture.status)) {
    throw new z.errors.Error(
      `The capture ${capture.id} is still ${capture.status} after the time a Zapier step may take. It finishes on ` +
        'its own and is charged once it succeeds. A viewport capture instead of a full page, or a shorter page ' +
        'timeout, is quicker.',
      'capture_not_finished',
    );
  }
  return output(z, operation, capture, requestedUrl);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeCreate = (operation) => {
  const definition = OPERATIONS[operation];

  const perform = async (z, bundle) => {
    const body = buildBody(operation, bundle.inputData);

    if (operation === 'record_video') {
      const started = await z.request({
        url: `${INSTANT_SNAP_BASE}/captures`,
        method: 'POST',
        body: { ...body, async: true, callback_url: z.generateCallbackUrl() },
      });

      // Kept by Zapier as bundle.outputData for performResume.
      return { id: started.data.id, status: started.data.status, url: body.url };
    }

    const deadline = Date.now() + POLL_BUDGET_MS;
    const response = await z.request({
      url: `${INSTANT_SNAP_BASE}/captures`,
      method: 'POST',
      body: { ...body, async: true },
    });

    let capture = response.data;
    while (!FINAL_OK.has(capture.status) && !FINAL_FAILED.has(capture.status) && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      capture = await readCapture(z, capture.id);
    }

    return finish(z, operation, capture, body.url);
  };

  const performResume = async (z, bundle) => {
    const captureId = bundle.outputData && bundle.outputData.id;
    const capture = await readCapture(z, captureId);
    return finish(z, operation, capture, bundle.outputData.url);
  };

  const sample = {
    id: '3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69',
    status: 'succeeded',
    url: 'https://example.com',
    media_category: definition.mediaCategory,
    format: { image: 'png', pdf: 'document_pdf', video: 'mp4', content: 'markdown' }[definition.mediaCategory],
    content_type: { image: 'image/png', pdf: 'application/pdf', video: 'video/mp4', content: 'text/markdown' }[
      definition.mediaCategory
    ],
    size_bytes: 482113,
    width: 1920,
    height: 1080,
    duration_ms: 4210,
    page_http_status: 200,
    captured_at: '2026-09-26T10:30:04.512Z',
    final_url: null,
    media_sha256: '9f2c000000000000000000000000000000000000000000000000000000000000',
    expires_at: '2026-09-27T10:30:04.512Z',
  };
  if (operation === 'get_page_content') sample.content = '# Example Domain\n\nThis domain is for use in documentation examples.';
  else sample.file = 'https://zapier.com/engine/hydrate/1/abcdef/';

  return {
    key: operation,
    noun: definition.noun,
    display: { label: definition.label, description: definition.description },
    operation: {
      inputFields: [COMMON_FIELDS[0], ...definition.fields, ...COMMON_FIELDS.slice(1)],
      perform,
      ...(operation === 'record_video' ? { performResume } : {}),
      sample,
      outputFields: [
        { key: 'id', label: 'Capture ID' },
        { key: 'status', label: 'Status' },
        { key: 'url', label: 'URL' },
        { key: 'format', label: 'Format' },
        { key: 'content_type', label: 'Content Type' },
        { key: 'size_bytes', label: 'Size (bytes)', type: 'integer' },
        { key: 'width', label: 'Width', type: 'integer' },
        { key: 'height', label: 'Height', type: 'integer' },
        { key: 'page_http_status', label: 'Page HTTP Status', type: 'integer' },
        { key: 'captured_at', label: 'Captured At', type: 'datetime' },
        { key: 'final_url', label: 'Final URL' },
        { key: 'expires_at', label: 'File Expires At', type: 'datetime' },
        operation === 'get_page_content'
          ? { key: 'content', label: 'Content' }
          : { key: 'file', label: 'File', type: 'file' },
      ],
    },
  };
};

const creates = Object.keys(OPERATIONS).map(makeCreate);

module.exports = { creates, buildBody, OPERATIONS };
