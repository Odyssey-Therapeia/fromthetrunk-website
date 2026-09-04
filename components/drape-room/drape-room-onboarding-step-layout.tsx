import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DrapeRoomOnboardingStepLayout({
  eyebrow,
  title,
  titleId,
  media,
  mobileMediaFirst = false,
  children,
}: {
  eyebrow: string;
  title: string;
  titleId?: string;
  media: ReactNode;
  mobileMediaFirst?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5 p-4 @sm:p-6 @3xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] @3xl:items-center @3xl:gap-7">
      <div
        className={cn(
          "min-w-0 @3xl:order-1",
          mobileMediaFirst ? "order-1" : "order-2",
        )}
      >
        {media}
      </div>
      <div
        className={cn(
          "min-w-0 @3xl:order-2",
          mobileMediaFirst ? "order-2" : "order-1",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/60">
          {eyebrow}
        </p>
        <h2
          id={titleId}
          className="mt-2 text-balance font-serif text-[clamp(2rem,7vw,3rem)] leading-[0.98]"
        >
          {title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-ftt-navy/70">
          {children}
        </div>
      </div>
    </div>
  );
}
