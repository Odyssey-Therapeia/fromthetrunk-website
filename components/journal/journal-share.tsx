"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type MouseEvent } from "react";

import {
  EmailShareIcon,
  FacebookShareIcon,
  PinterestShareIcon,
  WhatsAppShareIcon,
  XShareIcon,
} from "@/components/journal/journal-share-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { journalShareTargets, type JournalShareTargetId } from "@/lib/journal/share";
import { cn } from "@/lib/utils";

const COPIED_RESET_MS = 2500;

const TARGET_ICONS: Record<JournalShareTargetId, ComponentType<{ className?: string }>> = {
  whatsapp: WhatsAppShareIcon,
  pinterest: PinterestShareIcon,
  facebook: FacebookShareIcon,
  x: XShareIcon,
  email: EmailShareIcon,
};

type CopyState = "idle" | "copied" | "failed";

type JournalShareProps = {
  url: string;
  title: string;
  text: string;
  imageUrl?: string | null;
  className?: string;
};

/** Touch devices with a system share sheet get it; everything else gets the menu. */
function prefersNativeShare(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

/**
 * Copies with the Clipboard API, falling back to a hidden field and
 * `execCommand` (older Safari, insecure origins, denied permission). The
 * field goes inside `host`, not `document.body`: focusing anything outside
 * the popover would dismiss it before "Link copied" could show.
 */
async function copyText(value: string, host: HTMLElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the selection fallback.
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.tabIndex = -1;
  field.style.position = "fixed";
  field.style.opacity = "0";
  field.style.pointerEvents = "none";
  host.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-ftt-midnight outline-none transition-colors hover:bg-ftt-ivory focus-visible:bg-ftt-ivory focus-visible:ring-2 focus-visible:ring-ftt-navy";

const iconTileClass =
  "flex size-8 shrink-0 items-center justify-center rounded-full bg-ftt-navy/[0.06] text-ftt-navy [&_svg]:size-4";

export function JournalShare({ url, title, text, imageUrl, className }: JournalShareProps) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const onTriggerClick = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!prefersNativeShare()) return;
    // Skip the menu and hand off to the system sheet.
    event.preventDefault();
    try {
      await navigator.share({ title, text, url });
    } catch (error) {
      // Dismissing the sheet is not an error; anything else falls back to the menu.
      if (!(error instanceof DOMException && error.name === "AbortError")) setOpen(true);
    }
  };

  const onCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const copied = await copyText(url, button.parentElement ?? button);
    button.focus({ preventScroll: true });
    setCopyState(copied ? "copied" : "failed");
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), COPIED_RESET_MS);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setCopyState("idle");
  };

  const targets = journalShareTargets({ url, title, imageUrl });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        onClick={onTriggerClick}
        className={cn(
          "-mx-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 transition-colors hover:bg-journal-navy/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-journal-navy data-[state=open]:bg-journal-navy/[0.06]",
          className,
        )}
      >
        <Share2 aria-hidden="true" strokeWidth={1.5} className="size-4" />
        Share
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="w-64 rounded-2xl border-ftt-border bg-ftt-card p-2 text-ftt-midnight shadow-[0_18px_48px_rgba(20,29,70,0.16)]"
      >
        <p className="px-2.5 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/80">
          Share this story
        </p>
        <ul className="grid gap-0.5">
          {targets.map((target) => {
            const Icon = TARGET_ICONS[target.id];
            return (
              <li key={target.id}>
                <a
                  href={target.href}
                  target={target.newTab ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  <span className={iconTileClass}>
                    <Icon />
                  </span>
                  {target.label}
                  {target.newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
                </a>
              </li>
            );
          })}
          <li className="mt-1 border-t border-ftt-border pt-1">
            <button type="button" onClick={onCopy} className={itemClass}>
              <span className={cn(iconTileClass, copyState === "copied" && "bg-ftt-navy text-ftt-ivory")}>
                {copyState === "copied" ? (
                  <Check aria-hidden="true" strokeWidth={2} />
                ) : (
                  <Link2 aria-hidden="true" strokeWidth={1.6} />
                )}
              </span>
              Copy link
            </button>
          </li>
        </ul>
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "overflow-hidden px-2.5 text-xs leading-5 text-ftt-burgundy transition-[opacity,padding] duration-200 motion-reduce:transition-none",
            copyState === "idle" ? "h-0 opacity-0" : "pb-2 pt-1 opacity-100",
          )}
        >
          {copyState === "copied"
            ? "Link copied"
            : copyState === "failed"
              ? "Couldn’t copy. Copy the address from your browser bar instead."
              : ""}
        </p>
      </PopoverContent>
    </Popover>
  );
}
