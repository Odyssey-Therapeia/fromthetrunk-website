// Promo messages for the scrolling announcement marquee. The FIRST25 offer leads
// so reduced-motion viewers (animation disabled) still see it first.
const MESSAGES = [
  "First 25 customers get ₹100 off — use code FIRST25 at checkout. Grab yours now",
  "Free shipping on all orders",
  "Occasional sarees coming soon",
] as const;

// One seamless half of the marquee. The messages are repeated so a single half is
// wider than the viewport — otherwise a blank gap appears at the far end of the
// -50% loop. The track renders this half twice; translateX(-50%) shifts by exactly
// one half, so the loop is seamless.
const HALF = [...MESSAGES, ...MESSAGES, ...MESSAGES];

// Render a marquee message, turning the FIRST25 coupon code into a highlighted
// gold chip so it stands out from the surrounding promo copy.
function renderMessage(message: string) {
  const segments = message.split("FIRST25");
  return segments.map((segment, index) => (
    <span key={index}>
      {segment}
      {index < segments.length - 1 ? (
        <span className="mx-1 inline-block rounded bg-[#B39152] px-1.5 align-middle font-bold tracking-[0.12em] text-[#141D46]">
          FIRST25
        </span>
      ) : null}
    </span>
  ));
}

/** Slim promo bar: a continuous right-to-left marquee of launch offers. */
export function AnnouncementBar() {
  return (
    <div className="overflow-hidden border-b border-[#B39152]/25 bg-linear-to-r from-[#601D1C] to-[#141D46] py-2 text-xs">
      {/* Screen readers get the promos once, cleanly; the animated marquee below
          is decorative and repeated, so it is hidden from assistive tech. */}
      <p className="sr-only">{MESSAGES.join(". ")}.</p>

      <div
        aria-hidden="true"
        className="flex w-max animate-[ftt-marquee_50s_linear_infinite] items-center whitespace-nowrap leading-4 tracking-[0.15em] uppercase hover:[animation-play-state:paused] motion-reduce:animate-none"
      >
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0 items-center">
            {HALF.map((message, index) => (
              <span
                key={index}
                className="flex items-center font-medium text-[#FDF7F1]"
              >
                <span className="px-6">{renderMessage(message)}</span>
                <span className="text-[0.7em] text-[#B39152]">◆</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
