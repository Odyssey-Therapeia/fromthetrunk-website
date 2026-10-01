"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type JournalAccordionItem = {
  /** Anchor id, set on the row's heading: `#id` opens and scrolls to the row. */
  id: string;
  label: ReactNode;
  content: ReactNode;
};

/** Burgundy ring, same weight and offset as the Journal card's navy ring. */
const FOCUS =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-journal-burgundy";

/** A closing panel stays visible until its animation ends; this covers a missed `animationend`. */
const ANIMATION_FALLBACK_MS = 400;

function reducedMotion() {
  return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Ends a panel's animation (only the latest one, by token). Closed panels keep
 * their text in the page, findable and indexable, via `hidden="until-found"`.
 */
function settle(panel: HTMLElement, token = panel.dataset.animating) {
  if (token !== panel.dataset.animating) return;
  panel.removeAttribute("data-animating");
  if (panel.dataset.state === "closed") panel.setAttribute("hidden", "until-found");
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      className="journal-accordion-icon mt-1 size-5 shrink-0 text-journal-navy transition-transform duration-300 ease-out group-data-[state=open]/trigger:rotate-45 motion-reduce:transition-none @md:mt-[0.3125rem] @md:size-[1.375rem]"
    >
      <path d="M12 3v18M3 12h18" />
    </svg>
  );
}

/**
 * Expandable rows for the Journal, on the shared Radix accordion.
 *
 * - Each row is a real heading holding a button (aria-expanded,
 *   aria-controls); each panel is a region labelled by its button.
 * - Closed panels stay in the DOM with `hidden="until-found"`, so search
 *   engines and find-in-page reach them; a find match (`beforematch`) or a
 *   `#id` link opens the row.
 * - React 19 cannot server-render `hidden="until-found"`, so panels arrive
 *   without it and the attribute is set on hydration. Before that, CSS in
 *   globals.css collapses closed panels when scripting is on, and leaves every
 *   panel open when it is off.
 * - Open rows are not remembered across pages.
 */
export function JournalAccordion({
  items,
  variant = "plain",
  headingLevel = 3,
  className,
}: {
  items: readonly JournalAccordionItem[];
  /** `plain`: hairline rows. `card`: rows inside one rounded card. */
  variant?: "plain" | "card";
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  const [open, setOpen] = useState<string[]>([]);
  const openRef = useRef(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const panels = useRef(new Map<string, HTMLElement>());
  const previous = useRef<string[] | null>(null);
  const animations = useRef(0);

  /** Unhides opening panels first, so Radix measures their real height for the animation. */
  const changeOpen = useCallback((next: (current: string[]) => string[]) => {
    const value = next(openRef.current);
    for (const id of value) panels.current.get(id)?.removeAttribute("hidden");
    openRef.current = value;
    setOpen(value);
  }, []);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = open;
    const animate = before !== null && !reducedMotion();

    for (const [id, panel] of panels.current) {
      const isOpen = open.includes(id);
      if (before !== null && before.includes(id) === isOpen) continue;
      if (isOpen) panel.removeAttribute("hidden");
      if (!animate) {
        panel.removeAttribute("data-animating");
        settle(panel);
        continue;
      }
      const token = String((animations.current += 1));
      panel.setAttribute("data-animating", token);
      window.setTimeout(() => settle(panel, token), ANIMATION_FALLBACK_MS);
    }
    rootRef.current?.setAttribute("data-ready", "");
  }, [open]);

  // Deep links and in-page links: `#id` on a row (or anything inside its panel) opens it.
  useEffect(() => {
    function openFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      const row = target && rootRef.current?.contains(target)
        ? target.closest<HTMLElement>("[data-journal-accordion-item]")?.dataset.journalAccordionItem
        : undefined;
      if (!target || !row) return;
      changeOpen((current) => (current.includes(row) ? current : [...current, row]));
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [changeOpen]);

  // Find-in-page reveals an until-found panel and fires `beforematch` first.
  useEffect(() => {
    const entries = [...panels.current];
    const listeners = entries.map(([id, panel]) => {
      const listener = () => changeOpen((current) => (current.includes(id) ? current : [...current, id]));
      panel.addEventListener("beforematch", listener);
      return () => panel.removeEventListener("beforematch", listener);
    });
    return () => listeners.forEach((remove) => remove());
  }, [changeOpen]);

  const allOpen = items.length > 0 && items.every((item) => open.includes(item.id));

  return (
    <div ref={rootRef} className={cn("journal-accordion @container", className)}>
      <div className="journal-accordion-toggle-all flex justify-end">
        <button
          type="button"
          aria-expanded={allOpen}
          onClick={() => changeOpen(() => (allOpen ? [] : items.map((item) => item.id)))}
          className={cn(
            "-mr-1 inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-medium leading-5 text-journal-navy underline decoration-journal-navy/30 underline-offset-4 transition-colors hover:decoration-journal-gold",
            FOCUS,
          )}
        >
          {allOpen ? "Hide all" : "Show all"}
        </button>
      </div>

      <Accordion
        type="multiple"
        value={open}
        onValueChange={(value) => changeOpen(() => value)}
        className={cn(
          "mt-1",
          variant === "card"
            ? "rounded-[1.25rem] border border-journal-navy/12 bg-journal-paper px-5 shadow-[0_1px_2px_rgb(11_29_75/0.04),0_12px_32px_-18px_rgb(11_29_75/0.18)] min-[390px]:px-6 @md:px-8"
            : "border-t border-journal-navy/15",
        )}
      >
        {items.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            data-journal-accordion-item={item.id}
            className={cn(
              "border-journal-navy/15 transition-colors duration-300 can-hover:has-[button:hover]:border-journal-gold data-[state=open]:border-journal-gold motion-reduce:transition-none",
              variant === "card" && "last:border-b-0",
            )}
          >
            <AccordionPrimitive.Header asChild>
              <Heading id={item.id} className="scroll-mt-32">
                {/* Radix drops aria-controls while closed; this panel is always mounted. */}
                <AccordionPrimitive.Trigger
                  aria-controls={`${item.id}-panel`}
                  className={cn(
                    "group/trigger flex min-h-12 w-full items-start justify-between gap-5 rounded-sm py-4 text-left @md:gap-8 @md:py-5",
                    FOCUS,
                  )}
                >
                  <span className="text-pretty font-journal-serif text-[1.3125rem] font-medium leading-7 text-journal-navy @md:text-[1.5625rem] @md:leading-8">
                    {item.label}
                  </span>
                  <PlusIcon />
                </AccordionPrimitive.Trigger>
              </Heading>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content
              forceMount
              id={`${item.id}-panel`}
              data-journal-accordion-panel={item.id}
              ref={(panel) => {
                if (panel) panels.current.set(item.id, panel);
                else panels.current.delete(item.id);
              }}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) settle(event.currentTarget);
              }}
              className="journal-accordion-panel"
            >
              <div className={cn("pb-6 @md:pb-7", variant === "plain" && "pr-10 @md:pr-14")}>{item.content}</div>
            </AccordionPrimitive.Content>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
