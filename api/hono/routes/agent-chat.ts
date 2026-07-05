import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  type InferUITools,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import type { HonoBindings } from "@/api/hono/types";
import {
  buildSystemPrompt,
  productAssistantFormContextSchema,
} from "@/lib/ai/prompts/product-assistant";
import { productTools } from "@/lib/ai/tools/product-tools";
import {
  getConversationById,
  updateConversationTitle,
  upsertConversation,
} from "@/db/queries/conversations";
import { getProduct } from "@/db/queries/products";
import { toRupees } from "@/db/money";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID } from "@/lib/ports/agent-chat";

type ProductAssistantUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof productTools>
>;

const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  formContext: productAssistantFormContextSchema.optional(),
  messages: z.array(z.unknown()),
  modelId: z
    .string()
    .refine((val) => ALLOWED_MODEL_IDS.includes(val), {
      message: "Unsupported modelId",
    })
    .optional(),
  productId: z.string().uuid().optional(),
  thinkingEnabled: z.boolean().optional(),
  thinkingEffort: z.enum(["low", "medium", "high", "max"]).optional(),
});

export const registerAgentChatRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.post("/", async (c) => {
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

    const authUser = c.get("authUser");
    if (!authUser || authUser.role !== "admin") {
      return Response.json(
        { code: "UNAUTHORIZED", error: "Admin access required." },
        { status: 401 },
      );
    }

    const userId = authUser.id;

    // Defense-in-depth cost/DoS cap for the LLM endpoint (admin-only, so this
    // is a safety net against runaway loops, not an access control). Keyed per
    // admin user + IP; generous enough for real interactive assistant use.
    const rateLimited = await rateLimitResponse(c.req.raw, `agent:chat:${userId}`, {
      limit: 30,
      requireDurable: true,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        { code: "INVALID_JSON", error: "Invalid request body." },
        { status: 400 },
      );
    }

    const parsedBody = chatRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return Response.json(
        {
          code: "INVALID_REQUEST",
          error: "Invalid request body.",
          issues: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const {
      conversationId,
      formContext,
      messages: inputMessages,
      modelId,
      productId,
      thinkingEnabled = true,
      thinkingEffort = "medium",
    } = parsedBody.data;
    const validatedMessages =
      await safeValidateUIMessages<ProductAssistantUIMessage>({
        messages: inputMessages,
        tools: productTools,
      });

    if (!validatedMessages.success) {
      return Response.json(
        { code: "INVALID_MESSAGES", error: validatedMessages.error.message },
        { status: 400 },
      );
    }

    if (conversationId) {
      try {
        const existing = await getConversationById(conversationId);
        if (existing && existing.userId !== userId) {
          return Response.json(
            { code: "FORBIDDEN", error: "Not your conversation." },
            { status: 403 },
          );
        }
      } catch (err: unknown) {
        console.error("[api/agent-chat] Conversation lookup failed:", err);
      }
    }

    let resolvedFormContext = formContext;
    if (productId && !formContext) {
      try {
        const product = await getProduct(productId);
        if (product) {
          resolvedFormContext = {
            currentStep: "General",
            values: {
              name: product.name ?? undefined,
              slug: product.slug ?? undefined,
              priceRupees: product.pricePaise
                ? toRupees(product.pricePaise)
                : undefined,
              originalPriceRupees: product.originalPricePaise
                ? toRupees(product.originalPricePaise)
                : undefined,
              storyTitle: product.storyTitle ?? undefined,
              storyNarrative: product.storyNarrative ?? undefined,
              storyProvenance: product.storyProvenance ?? undefined,
              storyEra: product.storyEra ?? undefined,
              detailsFabric: product.detailsFabric ?? undefined,
              detailsLength: product.detailsLength ?? undefined,
              detailsWidth: product.detailsWidth ?? undefined,
              detailsCondition: product.detailsCondition ?? undefined,
              detailsDesigner: product.detailsDesigner ?? undefined,
              status: product.status ?? undefined,
              featured: product.featured ?? undefined,
            },
            uploadedImageCount: product.images?.length ?? 0,
            uploadedImageFilenames:
              product.images?.map(
                (img: { media: { filename: string } }) => img.media.filename,
              ) ?? [],
          };
        }
      } catch (err) {
        console.error("[api/agent-chat] Product lookup failed:", err);
      }
    }

    const systemPrompt = buildSystemPrompt(resolvedFormContext);

    try {
      const selectedModel = modelId || DEFAULT_MODEL_ID;
      const result = streamText({
        model: anthropic(selectedModel),
        providerOptions: {
          anthropic: {
            effort: thinkingEffort,
            ...(thinkingEnabled && { thinking: { type: "adaptive" as const } }),
          },
        },
        system: systemPrompt,
        messages: await convertToModelMessages(validatedMessages.data, {
          tools: productTools,
        }),
        tools: productTools,
        stopWhen: stepCountIs(25),
        onFinish: async () => {
          if (conversationId) {
            try {
              const existing = await getConversationById(conversationId);
              await upsertConversation(
                conversationId,
                userId,
                validatedMessages.data,
                productId,
                selectedModel,
              );

              if (!existing?.title) {
                const firstUserMsg = validatedMessages.data.find(
                  (m: { role: string }) => m.role === "user",
                );
                if (firstUserMsg && "content" in firstUserMsg) {
                  const content = String(
                    typeof firstUserMsg.content === "string"
                      ? firstUserMsg.content
                      : Array.isArray(firstUserMsg.content)
                        ? firstUserMsg.content
                            .filter((p: { type: string }) => p.type === "text")
                            .map((p: { text: string }) => p.text)
                            .join(" ")
                        : "",
                  );
                  const title =
                    content.slice(0, 80).trim() || "New conversation";
                  await updateConversationTitle(conversationId, userId, title);
                }
              }
            } catch (err) {
              console.error("[api/agent-chat] Failed to persist conversation:", err);
            }
          }
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (error) {
      console.error("[api/agent-chat] Stream error:", error);
      const message =
        error instanceof Error ? error.message : "AI generation failed";
      return Response.json(
        { code: "STREAM_ERROR", error: message },
        { status: 500 },
      );
    }
  });
};
