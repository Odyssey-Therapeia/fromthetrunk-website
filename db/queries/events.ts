import { eq, InferInsertModel } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

export type CreateEventInput = Omit<InferInsertModel<typeof events>, "id" | "createdAt">;

/**
 * Inserts a new event row. Silently ignores duplicate event_id (ON CONFLICT DO NOTHING)
 * to preserve idempotency under concurrent webhook + callback races.
 */
export async function insertEvent(input: CreateEventInput): Promise<void> {
  await db
    .insert(events)
    .values({
      eventId: input.eventId,
      type: input.type,
      payload: input.payload,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: events.eventId });
}

export async function claimEvent(input: CreateEventInput): Promise<boolean> {
  const rows = await db
    .insert(events)
    .values({
      eventId: input.eventId,
      type: input.type,
      payload: input.payload,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: events.eventId })
    .returning({ id: events.id });

  return rows.length > 0;
}

/** Reads a single event by its unique `event_id` (null if absent). */
export async function getEventByEventId(
  eventId: string,
): Promise<{
  eventId: string;
  type: string;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
} | null> {
  const [row] = await db
    .select({
      eventId: events.eventId,
      type: events.type,
      payload: events.payload,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(eq(events.eventId, eventId))
    .limit(1);

  return row ?? null;
}
