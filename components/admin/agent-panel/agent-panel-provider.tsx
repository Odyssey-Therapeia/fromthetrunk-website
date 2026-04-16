"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";

import { useAgentChat } from "@/lib/hooks/use-agent-chat";

import { AgentPanel } from "./agent-panel";

/**
 * Layout-level provider that wraps the AssistantRuntimeProvider
 * and renders the AgentPanel. Chat state persists across page navigations.
 */
export function AgentPanelProvider() {
  const runtime = useAgentChat();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AgentPanel />
    </AssistantRuntimeProvider>
  );
}
