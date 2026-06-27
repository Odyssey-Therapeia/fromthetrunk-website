import { and, desc, eq, gt, type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { contactSubmissions } from "@/db/schema";

export type ContactSubmissionStatus = "closed" | "contacted" | "new" | "spam";
export type ContactSubmissionRecord = InferSelectModel<typeof contactSubmissions>;

export type CreateContactSubmissionInput = Omit<
  InferInsertModel<typeof contactSubmissions>,
  "createdAt" | "id" | "source" | "status" | "updatedAt"
> & {
  source?: string;
  status?: ContactSubmissionStatus;
};

const clampLimit = (limit?: number) => Math.min(Math.max(limit ?? 25, 1), 100);

export async function createContactSubmission(
  input: CreateContactSubmissionInput,
): Promise<ContactSubmissionRecord> {
  return requireFirstRow(
    await withRetry(() =>
      db
        .insert(contactSubmissions)
        .values({
          ...input,
          source: input.source ?? "connect_dialog",
          status: input.status ?? "new",
          updatedAt: new Date(),
        })
        .returning(),
    ),
    "Failed to create contact submission.",
  );
}

export async function findRecentContactDuplicate(input: {
  email: string;
  messageHash: string;
  since: Date;
}): Promise<ContactSubmissionRecord | null> {
  return (
    getFirstRow(
      await withRetry(() =>
        db
          .select()
          .from(contactSubmissions)
          .where(
            and(
              eq(contactSubmissions.email, input.email),
              eq(contactSubmissions.messageHash, input.messageHash),
              gt(contactSubmissions.createdAt, input.since),
            ),
          )
          .orderBy(desc(contactSubmissions.createdAt))
          .limit(1),
      ),
    ) ?? null
  );
}

export async function markContactAcknowledgementSent(
  id: string,
): Promise<ContactSubmissionRecord | null> {
  return (
    getFirstRow(
      await withRetry(() =>
        db
          .update(contactSubmissions)
          .set({
            acknowledgementEmailSentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contactSubmissions.id, id))
          .returning(),
      ),
    ) ?? null
  );
}

export async function markContactInternalNotificationSent(
  id: string,
): Promise<ContactSubmissionRecord | null> {
  return (
    getFirstRow(
      await withRetry(() =>
        db
          .update(contactSubmissions)
          .set({
            internalNotificationSentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contactSubmissions.id, id))
          .returning(),
      ),
    ) ?? null
  );
}

export async function listContactSubmissionsForAdmin(options?: {
  limit?: number;
  page?: number;
  status?: ContactSubmissionStatus;
}) {
  const limit = clampLimit(options?.limit);
  const page = Math.max(options?.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const whereClause = options?.status
    ? eq(contactSubmissions.status, options.status)
    : undefined;

  return withRetry(() =>
    db
      .select({
        acknowledgementEmailSentAt: contactSubmissions.acknowledgementEmailSentAt,
        createdAt: contactSubmissions.createdAt,
        email: contactSubmissions.email,
        id: contactSubmissions.id,
        internalNotificationSentAt: contactSubmissions.internalNotificationSentAt,
        ipHash: contactSubmissions.ipHash,
        message: contactSubmissions.message,
        messageHash: contactSubmissions.messageHash,
        name: contactSubmissions.name,
        pagePath: contactSubmissions.pagePath,
        phone: contactSubmissions.phone,
        source: contactSubmissions.source,
        status: contactSubmissions.status,
        topic: contactSubmissions.topic,
        updatedAt: contactSubmissions.updatedAt,
        userAgentHash: contactSubmissions.userAgentHash,
      })
      .from(contactSubmissions)
      .where(whereClause)
      .orderBy(desc(contactSubmissions.createdAt))
      .limit(limit)
      .offset(offset),
  );
}

export async function updateContactSubmissionStatus(
  id: string,
  status: ContactSubmissionStatus,
): Promise<ContactSubmissionRecord | null> {
  return (
    getFirstRow(
      await withRetry(() =>
        db
          .update(contactSubmissions)
          .set({ status, updatedAt: new Date() })
          .where(eq(contactSubmissions.id, id))
          .returning(),
      ),
    ) ?? null
  );
}
