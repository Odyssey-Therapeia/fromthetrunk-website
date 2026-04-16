"use client";

import {
  ThreadPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

function ThinkingIndicator() {
  return (
    <ThreadPrimitive.If running>
      <div className="flex items-center gap-2 px-1 py-2">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a96e]/60 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a96e]/60 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a96e]/60 [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-[#777]">Thinking...</span>
      </div>
    </ThreadPrimitive.If>
  );
}

function ThreadWelcome() {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c9a96e]/10">
          <Sparkles className="h-5 w-5 text-[#c9a96e]" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#e5e5e5]">
            FTT AI Assistant
          </p>
          <p className="max-w-[260px] text-xs text-[#777]">
            I can help with product listings, stories, tags, marketing copy,
            and general admin tasks.
          </p>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#6B1D1D] px-4 py-2.5 text-sm text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-bl-md bg-[#2a2a2a] px-4 py-2.5 text-sm text-[#e5e5e5]",
          "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
        )}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

export function AgentPanelMessages() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth px-3 pt-4 pb-2">
        <ThreadWelcome />
        <ThreadPrimitive.Messages
          components={{ AssistantMessage, UserMessage }}
        />
        <ThinkingIndicator />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
