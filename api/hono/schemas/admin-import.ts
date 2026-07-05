import { z } from "@hono/zod-openapi";

export const MAX_CSV_FILE_BYTES = 1_024 * 1_024;
export const MAX_CSV_ROWS = 1_000;
export const MAX_CSV_COLUMNS = 80;
export const MAX_CSV_FIELD_LENGTH = 2_000;
export const MAX_CSV_HEADER_LENGTH = 120;
export const MAX_CSV_FILE_ID_LENGTH = 80;

export const suggestMappingsSchema = z.object({
  headers: z.array(z.string().trim().min(1).max(MAX_CSV_HEADER_LENGTH)).max(MAX_CSV_COLUMNS),
});

export const fieldMappingSchema = z.object({
  csvColumn: z.string().trim().min(1).max(MAX_CSV_HEADER_LENGTH),
  dbField: z.string().trim().max(120),
  confidence: z.number().min(0).max(1),
  status: z.enum(["mapped", "unmapped", "skipped"]),
});

export const validateRowsSchema = z.object({
  fileId: z.string().trim().min(1).max(MAX_CSV_FILE_ID_LENGTH),
  mappings: z.array(fieldMappingSchema).max(MAX_CSV_COLUMNS),
});

export const executeImportSchema = z.object({
  fileId: z.string().trim().min(1).max(MAX_CSV_FILE_ID_LENGTH),
  mappings: z.array(fieldMappingSchema).max(MAX_CSV_COLUMNS),
});
