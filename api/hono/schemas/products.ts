import { z } from "@hono/zod-openapi";

export const PUBLIC_PRODUCTS_MAX_LIMIT = 100;
export const ADMIN_PRODUCTS_MAX_LIMIT = 500;
export const PRODUCT_IDS_MAX = 100;

const optionalNonNegativeInt = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  });

export const listProductsQuerySchema = z.object({
  ids: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return Array.from(
        new Set(
          value
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ).slice(0, PRODUCT_IDS_MAX);
    })
    .pipe(z.array(z.string().uuid()).max(PRODUCT_IDS_MAX).optional()),
  includeDrafts: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  limit: optionalNonNegativeInt,
  offset: optionalNonNegativeInt,
});

export const productInputSchema = z.object({
  /**
   * P4-02: Attribute values keyed by attribute_defs[n].key.
   * Stored as jsonb in products.attributes.
   * Application-layer validation via buildTypeZodSchema() runs before upsert.
   */
  attributes: z.record(z.string(), z.unknown()).optional(),
  collectionId: z.string().uuid().nullable().optional(),
  detailsCondition: z.string().nullable().optional(),
  detailsDesigner: z.string().nullable().optional(),
  detailsFabric: z.string().nullable().optional(),
  detailsLength: z.string().nullable().optional(),
  detailsWidth: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  imageMediaIds: z.array(z.string().uuid()).optional(),
  name: z.string().min(1),
  originalPricePaise: z.number().int().nullable().optional(),
  pricePaise: z.number().int().nonnegative(),
  reservedUntil: z.string().datetime().nullable().optional(),
  slug: z.string().min(1),
  soldAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
  stockStatus: z.enum(["available", "reserved", "sold"]).optional(),
  storyEra: z.string().nullable().optional(),
  storyNarrative: z.string().nullable().optional(),
  storyProvenance: z.string().nullable().optional(),
  storyTitle: z.string().min(1),
  tagIds: z.array(z.number().int()).optional(),
  /** P4-02: UUID of the selected product_types row, or null. */
  typeId: z.string().uuid().nullable().optional(),
});

export const productPatchSchema = productInputSchema.partial();

export const recommendationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 6)),
});

export const tagSuggestionSchema = z.object({
  detailsDesigner: z.string().optional().nullable(),
  detailsFabric: z.string().optional().nullable(),
  storyEra: z.string().optional().nullable(),
  storyNarrative: z.string().optional().nullable(),
  storyProvenance: z.string().optional().nullable(),
  storyTitle: z.string().optional().nullable(),
});

/**
 * P4-06: Bulk-edit request body schema.
 *
 * productIds — the selection; must be non-empty.
 * status     — optional; set all products to this status.
 * addCollectionId / removeCollectionId — add or remove manual membership.
 * addTagIds / removeTagIds — add or remove tag IDs for all products.
 *
 * At least one of (status, addCollectionId, removeCollectionId, addTagIds, removeTagIds)
 * must be present; validated in the route handler.
 */
export const bulkEditSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
  status: z.enum(["draft", "published"]).optional(),
  addCollectionId: z.string().uuid().optional(),
  removeCollectionId: z.string().uuid().optional(),
  addTagIds: z.array(z.number().int().positive()).optional(),
  removeTagIds: z.array(z.number().int().positive()).optional(),
});

/**
 * P4-06: CSV export query parameters.
 * productIds — optional comma-separated UUIDs for selection export.
 */
export const exportQuerySchema = z.object({
  productIds: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",").filter(Boolean) : undefined)),
  includeDrafts: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});
