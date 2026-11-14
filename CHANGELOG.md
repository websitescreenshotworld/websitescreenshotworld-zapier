# Changelog

## 1.0.1

- Capture Succeeded and Capture Failed: the test record now comes from the product picked in the trigger. It used to
  be an Auto Schedule capture whatever was picked, which offered fields (such as URL) that Instant Snap deliveries do
  not carry.

## 1.0.0

- Instant triggers: Capture Succeeded, Capture Failed, Page Changed, Delivery Completed, Schedule Paused, Sitemap
  Run Completed. Each registers its own webhook endpoint and verifies every delivery's signature.
- Actions: Take Screenshot, Create PDF, Record Video, Get Page Content, Capture Scheduled Page Now.
