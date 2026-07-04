# Staging Canonical And Filter SEO Fix Report

Date: 2026-07-04

## Existing Behavior Verified

Live staging `/collection?type=blouse` returns:
- `robots: noindex, follow`
- canonical to `/collection`

This is correct for query/filter pages.

## Change In This Pass

`/blouses` now force returns `robots: { index: false, follow: true }` in source, even when blouse QA products exist.

## Reason

The blouse page is currently useful for staging QA, but the current inventory is test-like and should not be indexed.

