"use client";

import { useState } from "react";

import { ConnectDialog } from "@/components/layout/connect-dialog";

export function ConnectDialogNavButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group/nav relative whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#601D1C]/82 transition-colors hover:text-[#601D1C] 2xl:text-[16px]"
      >
        Connect With Us
        <span className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] origin-left scale-x-0 rounded-full bg-[#B39152]/55 transition-transform duration-300 ease-out group-hover/nav:scale-x-100" />
      </button>
      <ConnectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
