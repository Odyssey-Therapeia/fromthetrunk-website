# Phase F Media Approval Packet

Status: approval packet only. No live media replacement was performed.

## Named Large Assets

| Asset | Current size | Intrinsic dimensions | Current route/use | Current rendered/transfer evidence | Proposed candidate | Expected saving | Visual approval |
| --- | ---: | ---: | --- | --- | --- | ---: | --- |
| `public/Welcoming.mp4` | 13M | 3840x2160, 6.93s | Desktop intro video source | skipped on mobile by code; not a public mobile LHCI top transfer | compressed MP4 or remove MP4 fallback if WebM support policy allows | high | required |
| `public/Welcoming.webm` | 3.0M | 3840x2160 | Desktop intro video source | not in public mobile LHCI top transfer | lower-bitrate WebM/AV1/WebM | medium | required |
| `public/welcome.webp` | 6.8M | 3840x2160 | not found in current source references | no current route transfer evidence | archive or replace only if confirmed unused | high if used later | required before deletion/replacement |
| `public/hero/banner.png` | 11M | 2500x1768 | fallback/social/story references | large source; not direct latest public mobile LCP top transfer | AVIF/WebP derivative with same crop/color | high | required |
| `public/hero/timeless.JPG` | 7.5M | 5184x3456 | fabric/story/social fallback references | large source; may be selected in below-fold sections | AVIF/WebP derivative with same crop/color | high | required |
| `public/hero/banner1.png` | 5.8M | 2000x1414 | fallback/social/story references | large source; not direct latest public mobile LCP top transfer | AVIF/WebP derivative with same crop/color | high | required |
| `public/banner/collection_banner.png` | 4.1M | 1920x1080 | default OG/SEO image; legacy source | collection page uses mobile WebP banner assets for hero | keep for OG or replace OG with approved optimized canonical image | medium | required |
| `public/media/home-cover.png` | 2.9M | 1672x941 | homepage content reference | not latest top public mobile transfer | AVIF/WebP derivative with same crop/color | medium | required |

## Our Story Images

| Asset | Current size | Dimensions | Route | Transfer evidence | Approval note |
| --- | ---: | ---: | --- | --- | --- |
| `public/category/kanjiverram-lcp.webp` | 232K | 900x1350 | `/our-story` cover | optimized `w=750`, about 125481 bytes transfer | candidate for further compression only after visual review |
| `public/category/silk-lcp.webp` | 108K | 900x600 | `/our-story` cover card | not latest largest transfer | safe only with same crop/color review |
| `public/category/Organza.JPG`, `Chiffon.JPG`, `georgette.jpg`, `Cotton_Silk.JPG`, `kanji_mix.JPG`, `Kota_Cotton.jpg` | mixed; several are large | mixed | story chapter backgrounds | below-cover images; homepage latest top transfer included `/category/Chiffon.JPG` at about 188632 bytes | approve WebP/AVIF derivatives before swapping |

## Collection Hero Images

| Asset | Current size | Dimensions | Route | Transfer evidence | Approval note |
| --- | ---: | ---: | --- | --- | --- |
| `public/banner/collection_banner-mobile.webp` | 60K | 900x506 | `/collection` hero carousel | already small mobile WebP | no urgent replacement |
| `public/banner/collection-banner2-mobile.webp` | 48K | 900x506 | inactive collection carousel slide | mounted after delay | no urgent replacement |
| Remote product-card image | remote | remote | `/collection` product grid | largest latest transfer was about 105367 bytes | product representation approval required before transformation |

## PDP/Product Images

PDP/product media are remote product images resolved through the product data layer. They are product representation and must not be cropped, recolored, replaced, or compressed in a way that changes appearance without owner approval.

Safe fallback:
- tune `sizes`, `priority`, and lazy/eager policy without altering the image content;
- use production Speed Insights/PSI to identify specific PDP slugs before requesting product-media approval.

## Safe Fallback

If approval is not granted, keep current assets and treat mobile LCP as accepted risk or continue non-visual render-path work only.
