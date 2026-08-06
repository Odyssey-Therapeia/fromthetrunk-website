import { and, eq, inArray, InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { mediaDerivatives } from "@/db/schema";
import {
  MEDIA_DERIVATIVE_GENERATION_VERSION,
  type MediaDerivativeRole,
} from "@/lib/media/derivative-policy";
import { assertPublicationDerivativeRows } from "@/lib/media/publication-policy";

export type MediaDerivativeRecord = InferSelectModel<typeof mediaDerivatives>;
type MediaDerivativeInsert = InferInsertModel<typeof mediaDerivatives>;

export type ReadyMediaDerivativeInput = Pick<
  MediaDerivativeInsert,
  | "byteSize"
  | "generationVersion"
  | "height"
  | "mediaAssetId"
  | "mimeType"
  | "objectKey"
  | "role"
  | "sourceHash"
  | "sourceUpdatedAt"
  | "url"
  | "width"
>;

export const listMediaDerivativesForAssets = async (
  mediaAssetIds: string[],
): Promise<MediaDerivativeRecord[]> => {
  if (mediaAssetIds.length === 0) return [];
  return withRetry(() =>
    db
      .select()
      .from(mediaDerivatives)
      .where(inArray(mediaDerivatives.mediaAssetId, mediaAssetIds)),
  );
};

export const listReadyMediaDerivativesForAssets = async (
  mediaAssetIds: string[],
): Promise<MediaDerivativeRecord[]> => {
  if (mediaAssetIds.length === 0) return [];
  return withRetry(() =>
    db
      .select()
      .from(mediaDerivatives)
      .where(
        and(
          inArray(mediaDerivatives.mediaAssetId, mediaAssetIds),
          eq(mediaDerivatives.status, "ready"),
          eq(
            mediaDerivatives.generationVersion,
            MEDIA_DERIVATIVE_GENERATION_VERSION,
          ),
        ),
      ),
  );
};

export const listAllMediaDerivatives = async (): Promise<
  MediaDerivativeRecord[]
> => withRetry(() => db.select().from(mediaDerivatives));

export const getMediaDerivative = async ({
  generationVersion,
  mediaAssetId,
  role,
}: {
  generationVersion: number;
  mediaAssetId: string;
  role: MediaDerivativeRole;
}): Promise<MediaDerivativeRecord | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(mediaDerivatives)
      .where(
        and(
          eq(mediaDerivatives.mediaAssetId, mediaAssetId),
          eq(mediaDerivatives.role, role),
          eq(mediaDerivatives.generationVersion, generationVersion),
        ),
      )
      .limit(1),
  );
  return row ?? null;
};

export const markMediaDerivativeProcessing = async (
  input: Pick<
    MediaDerivativeInsert,
    | "generationVersion"
    | "mediaAssetId"
    | "objectKey"
    | "role"
    | "sourceHash"
    | "sourceUpdatedAt"
  >,
): Promise<MediaDerivativeRecord> => {
  const existing = await getMediaDerivative(input);
  if (existing?.status === "ready") return existing;

  return requireFirstRow(
    await withRetry(() =>
      db
        .insert(mediaDerivatives)
        .values({
          ...input,
          failureReason: null,
          status: "processing",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            mediaDerivatives.mediaAssetId,
            mediaDerivatives.role,
            mediaDerivatives.generationVersion,
          ],
          set: {
            failureReason: null,
            objectKey: input.objectKey,
            sourceHash: input.sourceHash,
            sourceUpdatedAt: input.sourceUpdatedAt,
            status: "processing",
            updatedAt: new Date(),
          },
        })
        .returning(),
    ),
    "Failed to claim media derivative generation.",
  );
};

/**
 * Atomic visibility switch: this executes only after the immutable Blob has
 * been uploaded and verified. A prior ready row remains active until here.
 */
export const saveReadyMediaDerivative = async (
  input: ReadyMediaDerivativeInput,
): Promise<MediaDerivativeRecord> =>
  requireFirstRow(
    await withRetry(() =>
      db
        .insert(mediaDerivatives)
        .values({
          ...input,
          failureReason: null,
          status: "ready",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            mediaDerivatives.mediaAssetId,
            mediaDerivatives.role,
            mediaDerivatives.generationVersion,
          ],
          set: {
            byteSize: input.byteSize,
            failureReason: null,
            height: input.height,
            mimeType: input.mimeType,
            objectKey: input.objectKey,
            sourceHash: input.sourceHash,
            sourceUpdatedAt: input.sourceUpdatedAt,
            status: "ready",
            updatedAt: new Date(),
            url: input.url,
            width: input.width,
          },
        })
        .returning(),
    ),
    "Failed to persist ready media derivative.",
  );

export const recordMediaDerivativeFailure = async ({
  failureReason,
  ...input
}: Pick<
  MediaDerivativeInsert,
  | "generationVersion"
  | "mediaAssetId"
  | "objectKey"
  | "role"
  | "sourceHash"
  | "sourceUpdatedAt"
> & { failureReason: string }): Promise<MediaDerivativeRecord> => {
  const existing = await getMediaDerivative(input);
  if (existing?.status === "ready") {
    return requireFirstRow(
      await withRetry(() =>
        db
          .update(mediaDerivatives)
          .set({ failureReason, updatedAt: new Date() })
          .where(eq(mediaDerivatives.id, existing.id))
          .returning(),
      ),
      "Failed to record media derivative failure.",
    );
  }

  return requireFirstRow(
    await withRetry(() =>
      db
        .insert(mediaDerivatives)
        .values({
          ...input,
          failureReason,
          status: "failed",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            mediaDerivatives.mediaAssetId,
            mediaDerivatives.role,
            mediaDerivatives.generationVersion,
          ],
          set: {
            failureReason,
            objectKey: input.objectKey,
            sourceHash: input.sourceHash,
            sourceUpdatedAt: input.sourceUpdatedAt,
            status: "failed",
            updatedAt: new Date(),
          },
        })
        .returning(),
    ),
    "Failed to record media derivative failure.",
  );
};

export const assertMediaAssetsReadyForPublication = async (
  mediaAssetIds: string[],
): Promise<void> => {
  const uniqueIds = Array.from(new Set(mediaAssetIds));
  if (uniqueIds.length === 0) {
    return assertPublicationDerivativeRows(uniqueIds, []);
  }

  const rows = await listReadyMediaDerivativesForAssets(uniqueIds);
  assertPublicationDerivativeRows(uniqueIds, rows);
};
