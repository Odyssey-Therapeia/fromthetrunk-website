import { cn } from "@/lib/utils";

type JournalCoverPlaceholderProps = {
  tag: string;
  /**
   * `card`: arch sits high so the card's own tag and title read below it.
   * `hero`: arch centred with the tag set inside the plate.
   */
  variant: "card" | "hero";
  className?: string;
};

/**
 * Designed stand-in for a missing cover: royal navy plate, a warm burgundy
 * glow, a gold hairline frame and the same arch-and-lotus line art as the site
 * footer. Purely decorative; the tag and title are always in the real text.
 */
export function JournalCoverPlaceholder({ tag, variant, className }: JournalCoverPlaceholderProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("@container absolute inset-0 overflow-hidden bg-ftt-navy", className)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_0%,color-mix(in_srgb,var(--ftt-burgundy)_62%,transparent)_0%,transparent_68%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_100%,color-mix(in_srgb,var(--ftt-gold)_14%,transparent)_0%,transparent_70%)]" />
      <div className="absolute inset-2.5 rounded-[1rem] border border-ftt-gold/35 @sm:inset-3.5" />
      <div className="absolute inset-4 rounded-[0.8rem] border border-ftt-gold/15 @sm:inset-5" />

      <div
        className={cn(
          "absolute inset-x-0 flex flex-col items-center",
          variant === "card"
            ? "top-[9%] h-[56%] @2xl:inset-x-auto @2xl:right-[9%] @2xl:top-[12%] @2xl:h-[72%]"
            : "top-1/2 h-[74%] -translate-y-1/2",
        )}
      >
        <svg
          viewBox="0 0 280 300"
          className="h-full w-auto text-ftt-gold/55"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <path d="M22 296V135C22 58 73 18 140 18s118 40 118 117v161" />
          <path d="M40 296V138c0-66 43-101 100-101s100 35 100 101v158" opacity=".45" />
          <path d="M38 205c16-26 41-39 76-39" opacity=".55" />
          <path d="M242 205c-16-26-41-39-76-39" opacity=".55" />
          <path d="M140 147c-8-19-6-35 0-50 6 15 8 31 0 50Z" />
          <path d="M122 156c-18-8-28-19-33-35 17 3 29 13 33 35Z" />
          <path d="M158 156c18-8 28-19 33-35-17 3-29 13-33 35Z" />
          <path d="M118 174c-17 2-31-4-42-16 16-6 30-1 42 16Z" />
          <path d="M162 174c17 2 31-4 42-16-16-6-30-1-42 16Z" />
        </svg>

        {variant === "hero" ? (
          <div className="absolute inset-x-0 top-[66%] flex flex-col items-center gap-2 px-6 text-center">
            <p className="font-serif text-[1.35rem] italic leading-tight text-ftt-ivory @md:text-[1.7rem] @xl:text-[2rem]">
              {tag}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.42em] text-ftt-gold @md:text-[10px]">
              From The Trunk
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
