"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type FilterLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
};

/**
 * Anchor that updates the collection filters via a client transition
 * (`router.replace` + `scroll: false`) instead of a full navigation. Because the
 * navigation runs inside `startTransition`, React keeps the current grid visible
 * until the new server render is ready — no `loading.tsx` skeleton flash and no
 * scroll jump. It still renders a real `href`, so it stays crawlable and
 * middle/⌘-click open in a new tab as expected.
 */
export function FilterLink({ href, className, children, title }: FilterLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <a
      href={href}
      title={title}
      data-pending={isPending ? "" : undefined}
      aria-busy={isPending || undefined}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      }}
      className={cn("transition-opacity data-[pending]:opacity-60", className)}
    >
      {children}
    </a>
  );
}
