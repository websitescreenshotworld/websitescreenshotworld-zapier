'use strict';

const crypto = require('crypto');

/**
 * Checks an X-WSW-Signature header ("t=<unix seconds>,v1=<hex>") the way every Website Screenshot World client
 * library does: split on "," and each part on its first "=", ignore unknown names, accept a timestamp within the
 * tolerance, and compare each v1 with the lowercase hex HMAC-SHA256 of `t + "." + body`, keyed with the secret's
 * UTF-8 bytes. The body must be the raw text as received.
 */
const verifySignature = (header, rawBody, secret, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)) => {
  if (!header) return { valid: false, reason: 'The X-WSW-Signature header is missing' };
  if (!secret) return { valid: false, reason: 'No signing secret is stored for this trigger' };

  let timestamp;
  const signatures = [];
  for (const part of String(header).split(',')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (name === 't') timestamp = value;
    else if (name === 'v1') signatures.push(value.toLowerCase());
  }

  if (timestamp === undefined || !/^\d+$/.test(timestamp)) {
    return { valid: false, reason: 'The signature has no valid timestamp' };
  }
  if (signatures.length === 0) return { valid: false, reason: 'The signature has no v1 value' };
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, reason: 'The signature timestamp is outside the allowed tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.from(rawBody || '', 'utf8')]))
    .digest();

  for (const signature of signatures) {
    if (!/^[0-9a-f]{64}$/.test(signature)) continue;
    if (crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return { valid: true };
  }
  return { valid: false, reason: 'The signature does not match' };
};

/** A header from a Zapier rawRequest, whose names arrive as "Http-X-Wsw-Signature". Case-insensitive. */
const rawHeader = (rawRequest, name) => {
  const headers = (rawRequest && rawRequest.headers) || {};
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === wanted || lower === `http-${wanted}`) return headers[key];
  }
  return undefined;
};

module.exports = { verifySignature, rawHeader };
