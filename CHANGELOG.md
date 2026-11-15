# Changelog

## 1.0.3

- Capture Succeeded and Capture Failed: with no product picked, the sample now has only the fields both products
  send. It used to be an Auto Schedule capture, whose schedule_id, schedule_name and sitemap_run_id an Instant Snap
  delivery never carries, which Zapier's validator reports.

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
