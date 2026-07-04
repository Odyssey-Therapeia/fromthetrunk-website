# Staging Media Optimization Approval Packet

Date: 2026-07-04

## Safe Change Already Made

The navbar logo now uses the AVIF asset with eager loading and high fetch priority in both server and client headers:
- `components/layout/site-header-server.tsx`
- `components/layout/site-header.tsx`

## Needs Approval

Recommended media work requiring owner/design approval:
- Replace very large hero PNG/JPG files with approved AVIF/WebP derivatives.
- Replace or remove unused large assets after CMS/reference check.
- Review packaging images used in checkout before resizing because they affect purchase confidence.
- Replace Unsplash references only after owner supplies original photography or approves substitutes.

## Do Not Do Without Approval

- Do not delete source assets.
- Do not crop product imagery.
- Do not alter colors or visible layout.
- Do not change product prices or stock.

