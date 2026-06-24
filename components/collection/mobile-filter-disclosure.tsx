"use client";

import { type ReactNode, useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

/**
 * Mobile / iPad filter entry point: a "Filter" button that opens a bottom sheet
 * holding the filter panel. Closes on outside-click (backdrop), Escape, the X,
 * or "View results". Scroll is locked while open. Shown below `lg` only — the
 * desktop sidebar handles larger screens.
 */
export function MobileFilterDisclosure({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full bg-ftt-navy px-4 text-sm font-medium text-ftt-ivory"
      >
        <SlidersHorizontal className="size-4" />
        Filter
        {activeCount > 0 ? (
          <span className="rounded-full bg-ftt-gold px-2 py-0.5 text-xs text-ftt-midnight">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ftt-midnight/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[1.5rem] border-t border-ftt-border bg-ftt-card shadow-[0_-20px_60px_rgba(14,13,14,0.28)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-ftt-border px-4 py-3">
              <span className="mx-auto h-1 w-10 -translate-x-3 rounded-full bg-ftt-border" aria-hidden />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-ftt-border bg-ftt-ivory text-ftt-burgundy/65 transition hover:text-ftt-burgundy"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grow overflow-y-auto p-4">{children}</div>

            <div className="border-t border-ftt-border p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-12 w-full rounded-full bg-ftt-navy text-sm font-medium text-ftt-ivory transition hover:bg-ftt-midnight"
              >
                View results
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
