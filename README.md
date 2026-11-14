# Website Screenshot World for Zapier

The [Website Screenshot World](https://www.websitescreenshotworld.com) integration for Zapier: take screenshots,
PDFs and videos of any web page, read a page's main content as Markdown, run a scheduled capture on demand, and
start a Zap the moment a capture finishes, fails or a page changes.

## Connecting

The connection asks for two keys, created in the app under **Developer Tools > API Keys**:

| Field | Needed for |
|---|---|
| Instant Snap API Key (`wsw_api_…`) | Everything: the capture actions and every trigger |
| Auto Schedule API Key (`wsw_autoapi_…`) | Optional. Only **Capture Scheduled Page Now** |

## Triggers (instant)

| Trigger | Event |
|---|---|
| Capture Succeeded | `capture.succeeded` - from a schedule or from the Instant Snap API (filter by product) |
| Capture Failed | `capture.failed` |
| Page Changed | `capture.changed` - a scheduled page differs from its previous capture |
| Delivery Completed | `delivery.completed` - a capture reached your cloud storage |
| Schedule Paused | `schedule.paused` |
| Sitemap Run Completed | `sitemap_run.completed` |

Turning a Zap on adds a webhook endpoint to your organization through the
[webhook endpoints API](https://www.websitescreenshotworld.com/api-documentation/webhook-endpoints); turning it off
deletes it. Each endpoint has a signing secret of its own, and every delivery's `X-WSW-Signature` is checked against
it before the Zap runs. Endpoints count towards the organization's limit of 25. Webhooks are in every paid plan.

## Actions

| Action | What it returns |
|---|---|
| Take Screenshot | PNG, JPEG, WebP or TIFF, as a file for the next step |
| Create PDF | A document PDF (selectable text) or an image PDF (looks like the screen) |
| Record Video | MP4, WebM, MOV or GIF of the page scrolling (plans with video) |
| Get Page Content | The page's main content as Markdown or plain text |
| Capture Scheduled Page Now | Starts a scheduled page's capture; the result arrives through Capture Succeeded |

A Zapier step may take 30 seconds. Screenshots, PDFs and page content are started asynchronously and read back
within that time. A video uses a Zapier callback: the step waits and the capture's webhook resumes it, and the
capture is then read again with the API key, so the callback itself is trusted for nothing. Files are fetched only
when a later step uses them (Zapier hydration); the signed download link never receives the API key.

## Development

Node.js 22 or later.

```sh
npm ci
npm test                 # unit tests against recorded API answers; no network
npm run validate         # zapier-platform validate --fail-for-publishing
```

Deploying needs a Zapier account and `npx zapier-platform login`, then `npx zapier-platform register` once and
`npx zapier-platform push` for each version.

## Licence

MIT
