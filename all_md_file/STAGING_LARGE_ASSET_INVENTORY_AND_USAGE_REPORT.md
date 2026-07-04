# Staging Large Asset Inventory And Usage Report

Date: 2026-07-04

## Large Assets Over 500 KB

Top assets observed:

| Asset | Size | Source usage |
| --- | ---: | --- |
| `public/Welcoming.mp4` | 13 MB | `components/sections/home-intro-gate.tsx` fallback video |
| `public/hero/banner.png` | 11 MB | Landing, fabric fallback, social section |
| `public/hero/timeless.JPG` | 7.5 MB | Landing, fabric fallback, social section |
| `public/welcome.webp` | 6.8 MB | No direct source reference found in quick scan |
| `public/hero/banner1.png` | 5.8 MB | Landing, fabric fallback, social section |
| `public/packaging/normalpkg-2.png` | 5.1 MB | Checkout packaging step |
| `public/Ftt_logo_navbar.svg` | 4.9 MB | No direct source reference found in quick scan |
| `public/packaging/normalpkg-1.png` | 4.8 MB | Packaging set |
| `public/banner/collection_banner.png` | 4.1 MB | OG image metadata |
| `public/banner/collection-banner2.png` | 3.8 MB | No direct source reference found in quick scan |

## Decision

No asset deletion was performed. Several large files are active visual assets or metadata assets and need owner approval before replacement.

