"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { toast } from "sonner";

import { useAgentStore } from "@/lib/store/agent-store";

/**
 * Creates a STABLE AssistantRuntime for the detached agent panel.
 *
 * Critical design: the transport is created ONCE (empty deps). Dynamic values
 * (conversationId, modelId, productId) are read at request-time via
 * `useAgentStore.getState()` inside the `body` thunk. This prevents transport
 * recreation on every state change, which was remounting the whole runtime
 * tree and killing keyboard focus.
 *
 * The provider uses `key={runtimeKey}` to force remount ONLY for intentional
 * actions: "New Chat" and "Switch Conversation".
 */
export function useAgentChat() {
  // Capture pending messages exactly ONCE at mount via a lazy initializer.
  // useState's initializer runs a single time and is render-safe (unlike
  // reading ref.current during render). We never call the setter, so the
  // component does NOT re-render when the store's pendingMessages later clears.
  const [initialMessages] = useState<UIMessage[] | undefined>(
    () =>
      (useAgentStore.getState().pendingMessages as UIMessage[] | undefined) ??
      undefined,
  );

  // Clear consumed pendingMessages after mount. Reading the captured snapshot
  // in an effect is fine; `initialMessages` is stable for the component's life.
  useEffect(() => {
    if (initialMessages) {
      useAgentStore.getState().setPendingMessages(null);
    }
  }, [initialMessages]);

  // Transport created ONCE -- the `body` thunk reads the latest store values
  // per-request, so dynamic values never force transport recreation.
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: () => {
          const s = useAgentStore.getState();
          return {
            conversationId: s.conversationId,
            productId: s.anchoredProductId ?? undefined,
            modelId: s.modelId,
            thinkingEnabled: s.thinkingEnabled,
            thinkingEffort: s.thinkingEffort,
          };
        },
      }),
    [], // stable -- no deps
  );

  return useChatRuntime({
    transport,
    messages: initialMessages,
    // `onError` is typed as ChatOnErrorCallback = (error: Error) => void by the
    // upgraded package, so `error` is no longer implicitly `any`.
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
