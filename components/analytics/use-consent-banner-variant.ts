import { useEffect, useState } from "react";

export type ConsentBannerVariant = "hero" | "default";

/**
 * Sample point ~90px above the viewport bottom — roughly where the fixed
 * consent banner card sits (bottom-4 + card height). We test whether the hero
 * section spans this Y coordinate rather than using scrollY, so it stays correct
 * for tall heroes, resizes, and zoom.
 */
const SAMPLE_OFFSET_PX = 90;

function computeVariant(): ConsentBannerVariant {
  if (typeof document === "undefined") return "default";

  const hero = document.querySelector<HTMLElement>(
    "#home-hero, [data-consent-banner-surface='hero']",
  );
  if (!hero) return "default";

  const rect = hero.getBoundingClientRect();
  const sampleY = window.innerHeight - SAMPLE_OFFSET_PX;
  return rect.top <= sampleY && rect.bottom >= sampleY ? "hero" : "default";
}

/**
 * Returns "hero" while the consent banner visually overlaps the home hero
 * section, else "default". SSR-safe (starts "default"); listens to scroll +
 * resize (rAF-throttled) and briefly polls so it catches the hero mounting late
 * behind the intro gate (mirrors the pattern in site-widgets.tsx). Non-home
 * pages have no hero element → always "default".
 */
export function useConsentBannerVariant(): ConsentBannerVariant {
  const [variant, setVariant] = useState<ConsentBannerVariant>("default");

  useEffect(() => {
    let raf = 0;

    const update = () => {
      raf = 0;
      setVariant((prev) => {
        const next = computeVariant();
        return next === prev ? prev : next;
      });
    };

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // Catch the hero once the intro gate reveals it, even without a scroll.
    const poll = window.setInterval(update, 300);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 8000);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return variant;
}
