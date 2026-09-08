"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import {
  DRAPE_ROOM_DRAPING_COMPLETE,
  DRAPE_ROOM_DRAPING_STEPS,
} from "./drape-room-copy";

/**
 * The fill stops here until the provider answers. Generation is one awaited
 * request with no progress events, so the last stretch is the one part of the
 * bar that would be a lie — the button waits rather than inventing it.
 */
const PROGRESS_CEILING = 92;
const TICK_MS = 400;

/** Share of the remaining distance covered per tick — a natural deceleration. */
const APPROACH_RATE = 0.075;
const OPENING_PROGRESS = 6;

export type DrapeRoomProgressButtonState =
  | "idle"
  | "checking"
  | "generating"
  | "complete";

type DrapeRoomProgressButtonProps = {
  state: DrapeRoomProgressButtonState;
  onClick: () => void;
  disabled?: boolean;
  idleLabel: string;
  checkingLabel: string;
  /** Icon for the resting state. Hidden once the fill takes over. */
  idleIcon?: React.ReactNode;
  className?: string;
};

export function DrapeRoomProgressButton({
  state,
  onClick,
  disabled = false,
  idleLabel,
  checkingLabel,
  idleIcon,
  className,
}: DrapeRoomProgressButtonProps) {
  const [progress, setProgress] = useState(0);

  const isGenerating = state === "generating";
  const isComplete = state === "complete";
  const isBusy = isGenerating || state === "checking";

  useEffect(() => {
    if (!isGenerating) return;

    // An immediate first move, so the press registers before the first tick.
    const opener = window.setTimeout(() => setProgress(OPENING_PROGRESS), 0);
    const timer = window.setInterval(() => {
      setProgress((current) =>
        Math.min(
          PROGRESS_CEILING,
          current + (PROGRESS_CEILING - current) * APPROACH_RATE,
        ),
      );
    }, TICK_MS);

    return () => {
      window.clearTimeout(opener);
      window.clearInterval(timer);
    };
  }, [isGenerating]);

  /*
   * Derived rather than stored: a finished request paints a full fill on the
   * very next render, and a button back at rest shows none — so a retry never
   * inherits the last attempt's fill.
   */
  const fillProgress =
    state === "idle" ? 0 : isComplete ? 100 : progress;

  const label = isComplete
    ? DRAPE_ROOM_DRAPING_COMPLETE
    : state === "checking"
      ? checkingLabel
      : isGenerating
        ? (DRAPE_ROOM_DRAPING_STEPS.find((step) => fillProgress < step.upTo) ??
            DRAPE_ROOM_DRAPING_STEPS[DRAPE_ROOM_DRAPING_STEPS.length - 1]!)
            .label
        : idleLabel;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isBusy || isComplete}
      aria-busy={isGenerating}
      /*
       * The visible label follows the drape; the accessible name does not, so
       * a screen reader is not interrupted four times during one wait. No
       * percentage is exposed either — the number is pacing, not measurement.
       */
      aria-label={isBusy || isComplete ? "Creating your drape" : undefined}
      className={cn(
        "relative isolate overflow-hidden",
        className,
        /*
         * These have to beat the caller's own classes, so they come last.
         *
         * While filling, the pill turns into the unfilled track — the dusty
         * rose the button already showed under the shared disabled fade — and
         * the burgundy fill reads against it. Without the opacity override
         * that same shared fade would wash out the fill along with the button.
         */
        (isBusy || isComplete) &&
          "bg-ftt-burgundy/45 hover:bg-ftt-burgundy/45 disabled:opacity-100",
        isGenerating && "cursor-wait",
      )}
    >
      {fillProgress > 0 ? (
        <span
          aria-hidden="true"
          data-drape-progress-fill
          className={cn(
            "absolute inset-y-0 left-0 -z-10 overflow-hidden",
            "bg-[linear-gradient(90deg,#601D1C_0%,#6D2423_62%,#7A2C29_100%)]",
            "transition-[width] duration-500 ease-out",
            "motion-reduce:transition-none",
          )}
          style={{ width: `${fillProgress}%` }}
        >
          {/* Silk sheen travelling through the draped portion. */}
          {isGenerating ? (
            <span className="ftt-drape-fill-sheen absolute inset-y-0 left-0 w-[30%] bg-[linear-gradient(90deg,transparent,rgba(253,247,241,0.3),transparent)]" />
          ) : null}

          {/* Gold thread at the leading edge, where the drape is being set. */}
          <span
            className={cn(
              "absolute inset-y-0 right-0 w-px bg-ftt-gold",
              "shadow-[0_0_14px_4px_rgba(179,145,82,0.42)]",
              isComplete && "opacity-0 transition-opacity duration-300",
            )}
          />
        </span>
      ) : null}

      {!isBusy && !isComplete ? idleIcon : null}
      <span aria-hidden="true">{label}</span>
    </button>
  );
}
