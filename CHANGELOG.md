# Changelog

## 1.0.2

- Capture Succeeded and Capture Failed: Instant Snap captures now carry the page's URL, which the API sends from
  version 1.3.0. The test records show it.

## 1.0.1

- Capture Succeeded and Capture Failed: the test record now comes from the product picked in the trigger. It used to
  be an Auto Schedule capture whatever was picked, which offered fields (such as URL) that Instant Snap deliveries do
  not carry.

## 1.0.0

- Instant triggers: Capture Succeeded, Capture Failed, Page Changed, Delivery Completed, Schedule Paused, Sitemap
  Run Completed. Each registers its own webhook endpoint and verifies every delivery's signature.
- Actions: Take Screenshot, Create PDF, Record Video, Get Page Content, Capture Scheduled Page Now.
