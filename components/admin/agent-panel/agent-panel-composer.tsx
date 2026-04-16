"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/store/agent-store";

export function AgentPanelComposer() {
  const { anchoredProductId } = useAgentStore();

  return (
    <div className="border-t border-[#333]">
      {anchoredProductId && (
        <div className="flex items-center gap-2 border-b border-[#333] px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[#777]">
            Working on product
          </span>
          <code className="rounded bg-[#222] px-1.5 py-0.5 text-[10px] text-[#c9a96e]">
            {anchoredProductId.slice(0, 8)}...
          </code>
        </div>
      )}
      <ComposerPrimitive.Root className="relative flex items-end gap-2 px-3 py-3">
        <ComposerPrimitive.Input
          autoFocus
          placeholder="Ask anything about your store..."
          className="min-h-[40px] flex-1 resize-none rounded-lg border border-[#444] bg-[#222] px-3 py-2.5 text-sm text-[#e5e5e5] outline-none placeholder:text-[#666] focus:border-[#c9a96e]/50 focus:ring-1 focus:ring-[#c9a96e]/30"
          rows={1}
        />
        <ComposerPrimitive.Send asChild>
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 bg-[#c9a96e] text-[#1a1a1a] hover:bg-[#b8984e]"
            aria-label="Send message"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
      <p className="px-3 pb-2 text-[10px] text-[#555]">
        Cmd+Return to send
      </p>
    </div>
  );
}
