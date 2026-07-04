# Final Media Optimization Backlog

Priority 1: LCP blockers
- Replace or further optimize above-fold hero/banner assets with AVIF/WebP at responsive dimensions.
- Verify the actual LCP element per route with a browser trace or LHCI detail report that includes element nodes.
- Keep product image representation unchanged.

Priority 2: Public large images
- Optimize `public/hero/banner.png`, `public/hero/banner1.png`, `public/hero/timeless.JPG`.
- Optimize collection banner PNGs.
- Optimize packaging PNGs or use responsive derivatives.
- Review large founder/team images and category images.

Priority 3: Video/media
- Audit `public/Welcoming.mp4`, `public/Welcoming.webm`, and `public/welcome.webp`.
- Ensure posters and lazy loading are used where video is below fold.

Priority 4: Source hygiene
- Confirm whether large PPTX files are needed in runtime repo.
- Move non-runtime source materials only after owner approval.

Verification after optimization:
- Run `pnpm run agent:check`.
- Pass mobile public LCP <= 2500 ms or get owner acceptance of launch risk.

