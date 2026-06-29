"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type CatalogFilterOption = {
  count?: number;
  label: string;
  swatch?: string;
  value: string;
};

export type CatalogFilterGroup = {
  key: string;
  options: CatalogFilterOption[];
  param:
    | "availability"
    | "collection"
    | "color"
    | "fabric"
    | "occasion"
    | "pattern"
    | "price"
    | "sort"
    | "tags"
    | "type"
    | "work";
  selected: string[];
  selection: "multi" | "single";
  title: string;
};

type MobileFilterSheetProps = {
  activeCount: number;
  groups: CatalogFilterGroup[];
  perPage?: number;
  preservedParams?: Partial<Record<"collection" | "type", string[]>>;
};

const encodeSelections = (groups: CatalogFilterGroup[]) =>
  Object.fromEntries(groups.map((group) => [group.key, group.selected]));

export function MobileFilterSheet({
  activeCount,
  groups,
  perPage,
  preservedParams,
}: MobileFilterSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const initialSelections = useMemo(() => encodeSelections(groups), [groups]);
  const [draft, setDraft] = useState<Record<string, string[]>>(initialSelections);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const openSheet = () => {
    setDraft(initialSelections);
    setOpen(true);
  };

  const draftCount = groups
    .filter((group) => group.param !== "sort")
    .reduce((sum, group) => sum + (draft[group.key]?.length ?? 0), 0);

  const toggle = (group: CatalogFilterGroup, value: string) => {
    setDraft((current) => {
      const selected = current[group.key] ?? [];
      const exists = selected.includes(value);
      const nextSelected =
        group.selection === "single"
          ? exists
            ? []
            : [value]
          : exists
            ? selected.filter((entry) => entry !== value)
            : [...selected, value];

      return { ...current, [group.key]: nextSelected };
    });
  };

  const buildHref = (nextDraft: Record<string, string[]>) => {
    const params = new URLSearchParams();
    for (const [param, values] of Object.entries(preservedParams ?? {})) {
      for (const value of values ?? []) {
        if (value) params.append(param, value);
      }
    }

    for (const group of groups) {
      const selected = nextDraft[group.key] ?? [];
      if (selected.length === 0) continue;

      if (group.param === "price") {
        const [range] = selected;
        const [min, max] = range.split(":");
        if (min) params.set("priceMin", min);
        if (max) params.set("priceMax", max);
        continue;
      }

      if (group.param === "sort") {
        const [sort] = selected;
        if (sort && sort !== "latest") params.set("sort", sort);
        continue;
      }

      for (const value of selected) {
        params.append(group.param, value);
      }
    }

    if (perPage) params.set("perPage", String(perPage));

    const query = params.toString();
    return `/collection${query ? `?${query}` : ""}`;
  };

  const apply = () => {
    const href = buildHref(draft);
    startTransition(() => {
      router.replace(href, { scroll: false });
      setOpen(false);
    });
  };

  const clear = () => {
    setDraft(
      Object.fromEntries(
        groups.map((group) => [
          group.key,
          group.param === "sort" ? ["latest"] : [],
        ]),
      ),
    );
  };

  const dialog = open ? (
    <div className="fixed inset-0 z-[80]">
      <div
        className="absolute inset-0 bg-ftt-midnight/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-filter-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[1.5rem] border-t border-ftt-border bg-ftt-card shadow-[0_-20px_60px_rgba(14,13,14,0.28)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ftt-border px-4 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-ftt-gold">
              Refine
            </p>
            <h2 id="mobile-filter-title" className="mt-1 font-serif text-2xl text-ftt-navy">
              Explore the trunk
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-ftt-border bg-ftt-ivory text-ftt-burgundy/65 transition hover:text-ftt-burgundy"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grow space-y-3 overflow-y-auto p-4">
          {groups.map((group) => {
            const selected = draft[group.key] ?? [];
            const selectedCount =
              group.param === "sort" ? 0 : selected.length;
            if (group.options.length === 0) return null;

            return (
              <details
                key={group.key}
                className="rounded-[1.1rem] border border-ftt-border bg-ftt-ivory/70 shadow-sm"
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ftt-navy">
                    {group.title}
                  </span>
                  {selectedCount > 0 ? (
                    <span className="rounded-full bg-ftt-gold px-2 py-0.5 text-xs font-semibold text-ftt-midnight">
                      {selectedCount}
                    </span>
                  ) : null}
                </summary>
                <div className="grid gap-2 border-t border-ftt-border/70 p-3">
                  {group.options.map((option) => {
                    const active = selected.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggle(group, option.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                          active
                            ? "border-ftt-navy bg-ftt-navy/8 text-ftt-navy"
                            : "border-ftt-border bg-white/65 text-ftt-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded-[5px] border",
                            active
                              ? "border-ftt-navy bg-ftt-navy"
                              : "border-ftt-border bg-ftt-ivory",
                          )}
                        >
                          {active ? (
                            <span className="size-1.5 rounded-[2px] bg-ftt-gold" />
                          ) : null}
                        </span>
                        {option.swatch ? (
                          <span
                            className="size-4 shrink-0 rounded-full border border-ftt-border"
                            style={{ backgroundColor: option.swatch }}
                            aria-hidden
                          />
                        ) : null}
                        <span className="min-w-0 flex-1">{option.label}</span>
                        {typeof option.count === "number" ? (
                          <span className="text-ftt-muted/70">({option.count})</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>

        <div className="grid grid-cols-[0.85fr_1.15fr] gap-3 border-t border-ftt-border bg-ftt-card p-4">
          <button
            type="button"
            onClick={clear}
            className="h-12 rounded-full border border-ftt-burgundy/35 bg-ftt-ivory text-sm font-semibold text-ftt-burgundy transition hover:bg-ftt-burgundy/8"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={isPending}
            className="h-12 rounded-full bg-ftt-navy text-sm font-medium text-ftt-ivory transition hover:bg-ftt-midnight disabled:opacity-60"
          >
            {isPending
              ? "Applying..."
              : draftCount > 0
                ? `Show pieces with ${draftCount} filters`
                : "Show pieces"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-full bg-ftt-navy px-4 text-sm font-medium text-ftt-ivory"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filter
        {activeCount > 0 ? (
          <span className="rounded-full bg-ftt-gold px-2 py-0.5 text-xs text-ftt-midnight">
            {activeCount}
          </span>
        ) : null}
      </button>

      {dialog ? createPortal(dialog, document.body) : null}
    </div>
  );
}
