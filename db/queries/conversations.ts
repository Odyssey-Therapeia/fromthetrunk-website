import { and, desc, eq } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { chatConversations } from "@/db/schema";

export type ChatConversation = typeof chatConversations.$inferSelect;

export const getConversation = async (
  conversationId: string,
  userId: string,
): Promise<ChatConversation | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId),
        ),
      )
      .limit(1)
  );
  return row ?? null;
};

export const getConversationForProduct = async (
  productId: string,
  userId: string,
): Promise<ChatConversation | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.productId, productId),
          eq(chatConversations.userId, userId),
        ),
      )
      .orderBy(desc(chatConversations.updatedAt))
      .limit(1)
  );
  return row ?? null;
};

export const upsertConversation = async (
  conversationId: string,
  userId: string,
  messages: unknown[],
  productId?: string | null,
): Promise<ChatConversation> => {
  const [row] = await db
    .insert(chatConversations)
    .values({
      id: conversationId,
      userId,
      productId: productId ?? null,
      messages,
    })
    .onConflictDoUpdate({
      target: chatConversations.id,
      set: {
        messages,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
};

export const deleteConversation = async (
  conversationId: string,
  userId: string,
): Promise<boolean> => {
  const deleted = await db
    .delete(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId),
      ),
    )
    .returning({ id: chatConversations.id });

  return deleted.length > 0;
};
