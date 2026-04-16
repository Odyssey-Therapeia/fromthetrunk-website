"use client";

import { History, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentStore } from "@/lib/store/agent-store";
import { AGENT_MODELS } from "@/lib/ports/agent-chat";

type AgentPanelHeaderProps = {
  onToggleHistory: () => void;
  historyOpen: boolean;
};

export function AgentPanelHeader({
  onToggleHistory,
  historyOpen,
}: AgentPanelHeaderProps) {
  const { modelId, setModelId, newChat, close } = useAgentStore();

  return (
    <div className="flex items-center gap-2 border-b border-[#333] px-4 py-3">
      <Select value={modelId} onValueChange={setModelId}>
        <SelectTrigger className="h-8 w-[160px] border-[#444] bg-[#222] text-xs text-[#ccc]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-[#444] bg-[#222]">
          {AGENT_MODELS.map((m) => (
            <SelectItem
              key={m.modelId}
              value={m.modelId}
              className="text-xs text-[#ccc]"
            >
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-1">
        <Button
          onClick={() => newChat()}
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-[#999] hover:text-[#ccc]"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          onClick={onToggleHistory}
          size="icon"
          variant={historyOpen ? "secondary" : "ghost"}
          className="h-8 w-8 text-[#999] hover:text-[#ccc]"
          title="Chat history"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          onClick={close}
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-[#999] hover:text-[#ccc]"
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
