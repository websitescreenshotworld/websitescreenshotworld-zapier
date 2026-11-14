'use strict';

/**
 * Where the two Website Screenshot World APIs live, and the little that every request shares.
 *
 * The Instant Snap key is sent only to the Instant Snap API and the Auto Schedule key only to the Auto Schedule
 * API. Download links are signed URLs on another host and never get a key: sending a credential to a host that does
 * not need it is how keys leak.
 */
const INSTANT_SNAP_ORIGIN = 'https://api.websitescreenshotworld.com';
const INSTANT_SNAP_BASE = `${INSTANT_SNAP_ORIGIN}/instant-snap/v1`;
const AUTO_SCHEDULE_ORIGIN = 'https://autoapi.websitescreenshotworld.com';
const AUTO_SCHEDULE_BASE = `${AUTO_SCHEDULE_ORIGIN}/auto-schedule/v1`;

const USER_AGENT = 'websitescreenshotworld-zapier';

const startsWith = (url, origin) => typeof url === 'string' && (url === origin || url.startsWith(`${origin}/`));

/** beforeRequest: the right key for the right host, and nothing for any other host. */
const addApiKey = (request, z, bundle) => {
  request.headers = request.headers || {};
  const authData = bundle.authData || {};

  if (startsWith(request.url, INSTANT_SNAP_ORIGIN) && authData.instant_snap_api_key) {
    request.headers['X-Api-Key'] = authData.instant_snap_api_key.trim();
  } else if (startsWith(request.url, AUTO_SCHEDULE_ORIGIN) && authData.auto_schedule_api_key) {
    request.headers['X-Api-Key'] = authData.auto_schedule_api_key.trim();
  }

  request.headers['User-Agent'] = request.headers['User-Agent'] || USER_AGENT;

  return request;
};

/** The API's refusal envelope, when the body is one: { success: false, error_code, error_message }. */
const readRefusal = (response) => {
  let body;
  try {
    body = typeof response.content === 'string' ? JSON.parse(response.content) : response.data;
  } catch (e) {
    body = undefined;
  }
  if (body && body.success === false && typeof body.error_code === 'string') {
    return body;
  }
  return null;
};

/**
 * afterResponse: turns the API's refusals into the errors Zapier knows how to show. A key problem is an
 * authentication error, so Zapier asks the user to reconnect; a 429 or 503 is a throttle with the API's own wait;
 * everything else carries the API's message and error code. Requests that expect a refusal (a delete of an
 * endpoint that is already gone) set skipThrowForStatus and are left alone.
 */
const handleRefusals = (response, z) => {
  if (response.status < 400 || response.skipThrowForStatus || (response.request && response.request.skipThrowForStatus)) {
    return response;
  }

  const refusal = readRefusal(response);
  const message = refusal ? refusal.error_message : `The request failed with HTTP ${response.status}.`;
  const code = refusal ? refusal.error_code : `http_${response.status}`;

  if (response.status === 401 || code === 'api_key_invalid') {
    throw new z.errors.Error(message, 'AuthenticationError', response.status);
  }

  if (response.status === 429 || response.status === 503) {
    const retryAfter = Number(
      (refusal && refusal.retry_after_seconds) || (response.getHeader && response.getHeader('retry-after')) || 60,
    );
    throw new z.errors.ThrottledError(message, Number.isFinite(retryAfter) ? retryAfter : 60);
  }

  throw new z.errors.Error(message, code, response.status);
};

/** The error code of an error thrown by handleRefusals (an AppError carries JSON in its message). */
const errorCode = (error) => {
  try {
    return JSON.parse(error.message).code;
  } catch (e) {
    return undefined;
  }
};

module.exports = {
  errorCode,
  INSTANT_SNAP_BASE,
  AUTO_SCHEDULE_BASE,
  addApiKey,
  handleRefusals,
  readRefusal,
};
