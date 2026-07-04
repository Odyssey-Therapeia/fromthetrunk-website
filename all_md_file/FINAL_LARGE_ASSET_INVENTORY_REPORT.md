# Final Large Asset Inventory Report

Result: Inventory only. No assets deleted.

Generated artifacts above 500 KB:
- `.next/` build/dev cache files.
- `.lighthouseci/` reports.
- `test-results/lighthouse/mobile/` reports.
- These are generated artifacts and not owner media.

Production/public large asset examples above 500 KB:
- `public/Welcoming.mp4` around 13 MB.
- `public/Welcoming.webm` around 3 MB.
- `public/welcome.webp` around 6.8 MB.
- `public/hero/banner.png` around 11 MB.
- `public/hero/banner1.png` around 5.8 MB.
- `public/hero/timeless.JPG` around 7.5 MB.
- `public/banner/collection_banner.png` around 4.1 MB.
- `public/banner/collection-banner2.png` around 3.8 MB.
- `public/packaging/normalpkg-1.png` through `normalpkg-5.png`, around 2.3 MB to 5.1 MB.
- `public/founder/*.jpg/png`, around 819 KB to 2.5 MB.
- `public/category/*.JPG/.jpg`, several around 600 KB to 1.6 MB.
- `public/Ftt_logo_navbar.svg` around 4.9 MB.
- `public/CoverPage.svg` around 2.8 MB.
- `components/product/*.pptx`, around 1.8 MB each.

Risk:
- Above-fold large raster/video assets remain the main media performance risk.
- Product photo representation must be preserved during optimization.

No deletion:
- No file was removed in this pass.

