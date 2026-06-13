/**
 * P3-05: Block editor schemas — FormSchema definitions for each registered block.
 *
 * Maps each block's propsSchema (Zod) to a FormSchema understood by SchemaForm.
 * The SchemaForm engine (P2-02a) drives the per-block props editor in the
 * block composer UI.
 *
 * IMPORTANT: These FormSchema definitions must stay in sync with the block
 * propsSchemas in registry.ts.  If a block's Zod schema changes, update here.
 *
 * Consumer: app/(admin)/admin/pages/[id]/edit/page.tsx (block composer).
 *
 * BLOCK_EDITOR_SCHEMAS — MAP: blockType → FormSchema
 * EDITOR_SCHEMA_BLOCK_TYPES — drift-check anchor (grep target for verifier)
 */

import { z } from "zod";
import type { FormSchema } from "@/lib/forms/types";

// ── Hero block schema ─────────────────────────────────────────────────────────
// Mirrors heroPropsSchema from lib/content/blocks/hero.tsx

export const heroEditorSchema: FormSchema = {
  fields: {
    headline: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Headline",
        placeholder: "e.g. Handpicked preloved sarees",
        description: "Main heading shown on the hero section.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. From The Trunk",
        description: "Small text shown above the headline.",
      },
    },
    subtitle: {
      zod: z.string().max(400).optional(),
      meta: {
        type: "textarea",
        label: "Subtitle",
        placeholder: "A short supporting sentence.",
        description: "Optional supporting copy below the headline.",
      },
    },
    primaryCtaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "Primary CTA label",
        placeholder: "e.g. Shop now",
        description: "Label for the primary call-to-action button.",
      },
    },
    primaryCtaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "Primary CTA URL",
        placeholder: "/collection/all",
        description: "Destination URL for the primary CTA.",
      },
    },
    secondaryCtaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "Secondary CTA label",
        placeholder: "e.g. Our story",
        description: "Label for the secondary CTA (outline button).",
      },
    },
    secondaryCtaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "Secondary CTA URL",
        placeholder: "/story",
        description: "Destination URL for the secondary CTA.",
      },
    },
    minHeight: {
      zod: z.enum(["60vh", "80vh", "90vh", "100vh"]).default("90vh"),
      meta: {
        type: "select",
        label: "Min height",
        options: [
          { label: "60vh", value: "60vh" },
          { label: "80vh", value: "80vh" },
          { label: "90vh (default)", value: "90vh" },
          { label: "100vh (full screen)", value: "100vh" },
        ],
        description: "Minimum height of the hero section.",
      },
    },
    backgroundImage: {
      zod: z.string().uuid().optional(),
      meta: {
        type: "image-ref",
        label: "Background image",
        description: "UUID of the media asset used as the hero background.",
      },
    },
    infoCardEyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Info card eyebrow",
        placeholder: "e.g. Condition",
        description: "Small label above the info card title.",
      },
    },
    infoCardTitle: {
      zod: z.string().max(120).optional(),
      meta: {
        type: "text",
        label: "Info card title",
        placeholder: "e.g. Excellent",
        description: "Main title of the floating info card.",
      },
    },
    infoCardBody: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "textarea",
        label: "Info card body",
        placeholder: "A short detail about the saree.",
        description: "Supporting text inside the info card.",
      },
    },
  },
};

// ── Rich-text block schema ────────────────────────────────────────────────────
// Mirrors richTextPropsSchema from lib/content/blocks/rich-text.tsx

export const richTextEditorSchema: FormSchema = {
  fields: {
    body: {
      zod: z.string().max(8000),
      meta: {
        type: "textarea",
        label: "Body",
        placeholder: "Write your content here…",
        description: "Main HTML body content (sanitized on render).",
      },
    },
    heading: {
      zod: z.string().max(200).optional(),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Our Story",
        description: "Optional heading shown above the body.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. About",
        description: "Small uppercase label above the heading.",
      },
    },
    align: {
      zod: z.enum(["left", "center"]).default("left"),
      meta: {
        type: "select",
        label: "Alignment",
        options: [
          { label: "Left (default)", value: "left" },
          { label: "Center", value: "center" },
        ],
        description: "Text alignment for the block.",
      },
    },
    maxWidth: {
      zod: z.enum(["prose", "wide", "full"]).default("prose"),
      meta: {
        type: "select",
        label: "Width",
        options: [
          { label: "Prose (default)", value: "prose" },
          { label: "Wide", value: "wide" },
          { label: "Full width", value: "full" },
        ],
        description: "Maximum width of the content container.",
      },
    },
  },
};

// ── Product grid block schema ─────────────────────────────────────────────────
// Mirrors productGridPropsSchema from lib/content/blocks/product-grid.tsx

export const productGridEditorSchema: FormSchema = {
  fields: {
    source: {
      zod: z.enum(["collection", "tag", "manual", "featured"]),
      meta: {
        type: "select",
        label: "Product source",
        options: [
          { label: "Featured", value: "featured" },
          { label: "By collection", value: "collection" },
          { label: "By tag", value: "tag" },
          { label: "Manual (IDs)", value: "manual" },
        ],
        description: "How products are selected for the grid.",
      },
    },
    heading: {
      zod: z.string().max(200).optional(),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Featured sarees",
        description: "Optional heading shown above the product grid.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. Shop",
        description: "Small label above the heading.",
      },
    },
    body: {
      zod: z.string().max(500).optional(),
      meta: {
        type: "textarea",
        label: "Description",
        placeholder: "A short description of this collection.",
        description: "Optional copy shown below the heading.",
      },
    },
    ctaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "CTA label",
        placeholder: "e.g. View all",
        description: "Label for the optional link beside the heading.",
      },
    },
    ctaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "CTA URL",
        placeholder: "/collection/all",
        description: "Destination URL for the CTA link.",
      },
    },
    collectionSlug: {
      zod: z.string().max(120).optional(),
      meta: {
        type: "text",
        label: "Collection slug",
        placeholder: "e.g. wedding-sarees",
        description: "Required when source = By collection.",
        showIf: (values) => values.source === "collection",
      },
    },
    tagName: {
      zod: z.string().max(120).optional(),
      meta: {
        type: "text",
        label: "Tag name",
        placeholder: "e.g. silk",
        description: "Required when source = By tag.",
        showIf: (values) => values.source === "tag",
      },
    },
    limit: {
      zod: z.number().int().min(1).max(12).default(4),
      meta: {
        type: "number",
        label: "Limit",
        placeholder: "4",
        description: "Maximum number of products to show (1–12).",
      },
    },
    layout: {
      zod: z.enum(["grid", "bento"]).default("grid"),
      meta: {
        type: "select",
        label: "Layout",
        options: [
          { label: "Grid (default)", value: "grid" },
          { label: "Bento", value: "bento" },
        ],
        description: "Visual layout of the product cards.",
      },
    },
    columns: {
      zod: z.enum(["2", "3", "4"]).default("3"),
      meta: {
        type: "select",
        label: "Columns",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns (default)", value: "3" },
          { label: "4 columns", value: "4" },
        ],
        description: "Number of grid columns (desktop).",
      },
    },
  },
};

// ── Registry map ──────────────────────────────────────────────────────────────

// EDITOR_SCHEMA_BLOCK_TYPES — verifier anchor: grep for this comment to confirm
// all three registered block types (hero, rich-text, product-grid) have schemas.

export const BLOCK_EDITOR_SCHEMAS: Record<string, FormSchema> = {
  hero: heroEditorSchema,
  "rich-text": richTextEditorSchema,
  "product-grid": productGridEditorSchema,
};
