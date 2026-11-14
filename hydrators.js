'use strict';

const { INSTANT_SNAP_BASE } = require('./lib/api');

/**
 * Fetches an Instant Snap capture's file when a later step asks for it, and hands it to Zapier's file store.
 *
 * The capture is read again first: its download link is signed and valid for 60 minutes, so a link saved earlier in
 * the Zap may have run out. The file itself is kept for 24 hours after the capture. The link carries no API key and
 * none is sent to it.
 */
const captureFile = async (z, bundle) => {
  const captureId = bundle.inputData.captureId;
  const response = await z.request({ url: `${INSTANT_SNAP_BASE}/captures/${encodeURIComponent(captureId)}` });
  const capture = response.data;

  if (!capture || typeof capture.download_url !== 'string' || capture.download_url === '') {
    throw new z.errors.Error(
      `Capture ${captureId} has no file to download (status "${capture && capture.status}"). Files are kept for 24 hours.`,
      'capture_file_unavailable',
    );
  }

  const fileRequest = z.request({ url: capture.download_url, raw: true });
  return z.stashFile(fileRequest, capture.size_bytes || undefined, fileName(capture), capture.content_type || undefined);
};

const EXTENSIONS = { image_pdf: 'pdf', document_pdf: 'pdf', markdown: 'md', text: 'txt', jpeg: 'jpg' };

const fileName = (capture) => {
  const format = String(capture.format || 'bin');
  return `${capture.id}.${EXTENSIONS[format] || format}`;
};

module.exports = { captureFile, fileName };
