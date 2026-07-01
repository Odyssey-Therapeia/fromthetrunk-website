"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { ConnectDialog } from "@/components/layout/connect-dialog";

/**
 * Hero CTA for "supply" keyword landing pages (e.g. /sell-your-saree). Opens the
 * shared Connect With Us dialog instead of navigating, so visitors can start a
 * submission without leaving the page.
 */
export function KeywordSubmissionCta({ label }: { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center justify-center rounded-full bg-ftt-ivory px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-ftt-navy shadow-[0_16px_44px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-white"
      >
        {label}
        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>

      <ConnectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
