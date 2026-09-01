"use client";

import * as React from "react";

import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Shared, content-driven shell for every Drape Room state. The dialog grows
 * with short content and caps itself at the usable viewport so only its body
 * needs to scroll.
 */
export function DrapeRoomDialogShell({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "@container left-1/2 top-1/2 z-[90] flex min-w-0 max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[54rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-[1.5rem] border-ftt-border bg-ftt-ivory p-0 text-ftt-navy shadow-[0_24px_80px_rgba(14,13,14,0.24)] motion-reduce:animate-none motion-reduce:transition-none max-sm:pl-[env(safe-area-inset-left)] max-sm:pr-[env(safe-area-inset-right)] max-sm:[&>button]:right-[max(1rem,env(safe-area-inset-right))] sm:max-h-[90dvh] sm:max-w-[44rem] sm:rounded-[1.75rem] lg:max-h-[88dvh] lg:max-w-[54rem]",
        className,
      )}
      {...props}
    />
  );
}
