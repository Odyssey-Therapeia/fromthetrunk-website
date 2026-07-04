# Final Unsplash Replacement Approval Notes

Replacements made:

| Old reference | New reference | Route/surface | Layout changed | Copy changed | Visual approval needed |
|---|---|---|---:|---:|---|
| `components/sections/brand-story-teaser.tsx` stock-image URL | `/footer/ftt-trunk-saree.webp` | Homepage brand story teaser | No | No | Recommended owner visual approval |
| `lib/story-narrative-images.ts` stock-image fallback | `/footer/ftt-trunk-saree.webp` | Story narrative fallback | No | No | Recommended owner visual approval |
| `lib/data/sarees.ts` demo image URLs | Existing local `/category`, `/hero`, `/banner`, `/media`, `/footer` assets | Legacy/demo fallback data | No | No | Recommended before relying on demo data publicly |

Approval note:
- The chosen local trunk image is semantically aligned with the existing story alt text and avoids adding new assets.
- Legacy demo data remains non-authoritative. If it becomes visible again, owner should approve final per-product media mapping.

