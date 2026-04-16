"use client";

import { useMemo } from "react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { toast } from "sonner";

import { useAgentStore } from "@/lib/store/agent-store";
import { agentChatAdapter } from "@/lib/adapters/agent-chat-rest";

/**
 * Creates an AssistantRuntime for the detached agent panel.
 * Lives at the layout level so chat state persists across page navigation.
 */
export function useAgentChat() {
  const { conversationId, anchoredProductId, modelId } = useAgentStore();

  const transport = useMemo(() => {
    const config = agentChatAdapter.getChatTransportConfig({
      conversationId: conversationId ?? crypto.randomUUID(),
      productId: anchoredProductId,
      modelId,
    });

    return new AssistantChatTransport({
      api: config.api,
      body: config.body,
    });
  }, [conversationId, anchoredProductId, modelId]);

  return useChatRuntime({
    transport,
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "AI request failed";
      toast.error(message);
    },
  });
}
