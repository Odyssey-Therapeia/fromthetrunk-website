import { cn } from "@/lib/utils";

type JournalCoverPlaceholderProps = {
  /**
   * `card`: arch sits high so the card's own tag and title read below it.
   * `thumb`: arch centred, for the small row thumbnail.
   * `hero`: arch right of centre, since the article hero fades out its left.
   */
  variant: "card" | "thumb" | "hero";
  className?: string;
};

/**
 * Designed stand-in for a missing card or thumbnail image: navy plate, a warm
 * burgundy glow, a gold hairline frame and the same arch-and-lotus line art as
 * the site footer. Purely decorative. The article hero's cover slot uses a
 * light version until the article has a photo: the gold line art on a pale
 * gold wash, unframed, so it fades into the ivory without going muddy.
 */
export function JournalCoverPlaceholder({ variant, className }: JournalCoverPlaceholderProps) {
  const thumb = variant === "thumb";
  const hero = variant === "hero";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "@container absolute inset-0 overflow-hidden",
        hero ? "bg-[color-mix(in_srgb,var(--journal-gold)_9%,var(--journal-ivory))]" : "bg-journal-navy",
        className,
      )}
    >
      {hero ? (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(70%_95%_at_78%_100%,color-mix(in_srgb,var(--journal-gold)_20%,transparent)_0%,transparent_72%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_85%_0%,color-mix(in_srgb,var(--journal-burgundy)_6%,transparent)_0%,transparent_70%)]" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_0%,color-mix(in_srgb,var(--journal-burgundy)_55%,transparent)_0%,transparent_68%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_100%,color-mix(in_srgb,var(--journal-gold)_14%,transparent)_0%,transparent_70%)]" />
          <div
            className={cn(
              "absolute rounded-[1rem] border border-journal-gold/35",
              thumb ? "inset-1.5 rounded-[0.55rem]" : "inset-2.5 @sm:inset-3.5",
            )}
          />
          {thumb ? null : (
            <div className="absolute inset-4 rounded-[0.8rem] border border-journal-gold/15 @sm:inset-5" />
          )}
        </>
      )}

      <div
        className={cn(
          "absolute flex flex-col items-center",
          thumb && "inset-x-0 top-1/2 h-[62%] -translate-y-1/2",
          hero && "bottom-0 right-[12%] h-[86%] @min-md:@max-xl:right-[6%] @min-md:@max-xl:h-[74%]",
          variant === "card" && "inset-x-0 top-[9%] h-[56%]",
        )}
      >
        <svg
          viewBox="0 0 280 300"
          className={cn("h-full w-auto", hero ? "text-journal-gold/80" : "text-journal-gold/55")}
          fill="none"
          stroke="currentColor"
          strokeWidth={thumb ? 2 : 1}
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
      </div>
    </div>
  );
}
