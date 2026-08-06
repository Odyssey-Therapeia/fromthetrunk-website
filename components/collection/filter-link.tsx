"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type FilterLinkProps = {
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
};

/**
 * Accessible control that updates collection filters via a client transition.
 * Because the
 * navigation runs inside `startTransition`, React keeps the current grid visible
 * until the new server render is ready — no `loading.tsx` skeleton flash and no
 * scroll jump. Filter combinations intentionally do not render crawlable links;
 * the resulting URL remains shareable and is added to browser history.
 */
export function FilterLink({
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  href,
  className,
  children,
  title,
}: FilterLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-pending={isPending ? "" : undefined}
      aria-busy={isPending || undefined}
      onClick={() => {
        startTransition(() => {
          router.push(href, { scroll: false });
        });
      }}
      className={cn("transition-opacity data-[pending]:opacity-60", className)}
    >
      {children}
    </button>
  );
}
