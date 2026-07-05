import { and, desc, eq, gt, type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { siteFeedbackSubmissions } from "@/db/schema";

export type SiteFeedbackStatus = "archived" | "new" | "reviewed" | "spam";
export type SiteFeedbackRecord = InferSelectModel<typeof siteFeedbackSubmissions>;

export type CreateSiteFeedbackSubmissionInput = Omit<
  InferInsertModel<typeof siteFeedbackSubmissions>,
  "createdAt" | "id" | "source" | "status" | "updatedAt"
> & {
  source?: string;
  status?: SiteFeedbackStatus;
};

const clampLimit = (limit?: number) => Math.min(Math.max(limit ?? 25, 1), 100);

export async function createSiteFeedbackSubmission(
  input: CreateSiteFeedbackSubmissionInput,
): Promise<SiteFeedbackRecord> {
  return requireFirstRow(
    await withRetry(() =>
      db
        .insert(siteFeedbackSubmissions)
        .values({
          ...input,
          source: input.source ?? "floating_review_tab",
          status: input.status ?? "new",
          updatedAt: new Date(),
        })
        .returning(),
    ),
    "Failed to create site feedback submission.",
  );
}

export async function findRecentSiteFeedbackDuplicate(input: {
  commentHash: string;
  pagePath: null | string;
  rating: number;
  since: Date;
}): Promise<SiteFeedbackRecord | null> {
  return (
    getFirstRow(
      await withRetry(() =>
        db
          .select()
          .from(siteFeedbackSubmissions)
          .where(
            and(
              eq(siteFeedbackSubmissions.rating, input.rating),
              eq(siteFeedbackSubmissions.commentHash, input.commentHash),
              input.pagePath
                ? eq(siteFeedbackSubmissions.pagePath, input.pagePath)
                : undefined,
              gt(siteFeedbackSubmissions.createdAt, input.since),
            ),
          )
          .orderBy(desc(siteFeedbackSubmissions.createdAt))
          .limit(1),
      ),
    ) ?? null
  );
}

export async function listSiteFeedbackForAdmin(options?: {
  limit?: number;
  page?: number;
  status?: SiteFeedbackStatus;
}) {
  const limit = clampLimit(options?.limit);
  const page = Math.max(options?.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const whereClause = options?.status
    ? eq(siteFeedbackSubmissions.status, options.status)
    : undefined;

  return withRetry(() =>
    db
      .select({
        comment: siteFeedbackSubmissions.comment,
        commentHash: siteFeedbackSubmissions.commentHash,
        createdAt: siteFeedbackSubmissions.createdAt,
        id: siteFeedbackSubmissions.id,
        ipHash: siteFeedbackSubmissions.ipHash,
        pagePath: siteFeedbackSubmissions.pagePath,
        rating: siteFeedbackSubmissions.rating,
        source: siteFeedbackSubmissions.source,
        status: siteFeedbackSubmissions.status,
        updatedAt: siteFeedbackSubmissions.updatedAt,
        userAgentHash: siteFeedbackSubmissions.userAgentHash,
      })
      .from(siteFeedbackSubmissions)
      .where(whereClause)
      .orderBy(desc(siteFeedbackSubmissions.createdAt))
      .limit(limit)
      .offset(offset),
  );
}

export async function updateSiteFeedbackStatus(
  id: string,
  status: SiteFeedbackStatus,
): Promise<SiteFeedbackRecord | null> {
  return (
    getFirstRow(
      await withRetry(() =>
        db
          .update(siteFeedbackSubmissions)
          .set({ status, updatedAt: new Date() })
          .where(eq(siteFeedbackSubmissions.id, id))
          .returning(),
      ),
    ) ?? null
  );
}
