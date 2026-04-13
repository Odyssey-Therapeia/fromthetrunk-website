import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText } from "ai";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { buildSystemPrompt } from "@/lib/ai/prompts/product-assistant";
import { productTools } from "@/lib/ai/tools/product-tools";
import {
  getConversation,
  upsertConversation,
} from "@/db/queries/conversations";

export const maxDuration = 120;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("{{")) {
    return Response.json(
      {
        code: "API_KEY_MISSING",
        error: "ANTHROPIC_API_KEY is not configured. Add it to .env.local.",
      },
      { status: 503 },
    );
  }

  const session = await getServerAuthSession();
  if (!session || session.user.role !== "admin") {
    return Response.json(
      { code: "UNAUTHORIZED", error: "Admin access required." },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { code: "INVALID_JSON", error: "Invalid request body." },
      { status: 400 },
    );
  }

  const {
    messages,
    formContext,
    conversationId,
    productId,
  } = body as {
    messages: unknown;
    formContext: unknown;
    conversationId?: string;
    productId?: string;
  };

  if (!messages || !Array.isArray(messages)) {
    return Response.json(
      { code: "INVALID_MESSAGES", error: "Messages array is required." },
      { status: 400 },
    );
  }

  if (conversationId) {
    try {
      const existing = await getConversation(conversationId, userId);
      if (existing && existing.userId !== userId) {
        return Response.json(
          { code: "FORBIDDEN", error: "Not your conversation." },
          { status: 403 },
        );
      }
    } catch {
      // Table may not exist yet; proceed without persistence check.
    }
  }

  const systemPrompt = buildSystemPrompt(
    formContext as Parameters<typeof buildSystemPrompt>[0],
  );

  try {
    const result = streamText({
      model: anthropic("claude-opus-4-6"),
      providerOptions: {
        anthropic: { thinking: { type: "enabled" } },
      },
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: productTools,
      stopWhen: stepCountIs(25),
      onFinish: async () => {
        if (conversationId) {
          try {
            await upsertConversation(
              conversationId,
              userId,
              messages as unknown[],
              productId,
            );
          } catch (err) {
            console.error("[api/chat] Failed to persist conversation:", err);
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[api/chat] Stream error:", error);
    const message =
      error instanceof Error ? error.message : "AI generation failed";
    return Response.json(
      { code: "STREAM_ERROR", error: message },
      { status: 500 },
    );
  }
}
