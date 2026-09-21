"use client";

/**
 * Decides which Drape Room button gets the coach mark, and when.
 *
 * Eligible triggers register themselves as they mount, so nothing has to guess
 * at DOM selectors or race the grid's render. The one nearest the middle of the
 * screen wins — a card the shopper has scrolled past teaches nobody anything.
 *
 * On the catalogue it arms itself after a short dwell rather than waiting to be
 * sent: the button is already on screen there, so the lesson arrives before the
 * launch teaser, which holds its own dwell until the coach mark is finished.
 *
 * It is a once-ever lesson. Both endings — taught or waved away — write the
 * guide cookie, and nothing else does.
 */

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { pickCoachmarkTarget } from "@/lib/drape-room/launch/coachmark-target";
import { drapeLaunchConfig } from "@/lib/drape-room/launch/config";
import {
  hasSeenDrapeCardCoachmark,
  markDrapeCardCoachmarkSeen,
} from "@/lib/drape-room/launch/storage";

type DrapeCoachmarkValue = {
  /** The product whose trigger currently carries the coach mark. */
  claimedProductId: null | string;
  /** True from the moment a button is claimed until the lesson ends. */
  isShowing: boolean;
  /** Arm the lesson explicitly. The catalogue also arms itself on a timer. */
  arm: () => void;
  /** Dismiss for good, whether taught or waved away. */
  complete: () => void;
  register: (productId: string, element: HTMLElement | null) => void;
  unregister: (productId: string) => void;
};

const DrapeCoachmarkContext = createContext<DrapeCoachmarkValue | null>(null);

/**
 * True only while a modal genuinely owns the screen.
 *
 * Radix locks body scroll for every dialog and sheet it opens, which covers the
 * teaser, the cart drawer and search in one check. A floating chat bubble or a
 * hand-rolled popup that merely carries role="dialog" is not a modal and must
 * not be allowed to suppress the lesson forever.
 */
const aModalOwnsTheScreen = () =>
  document.body.hasAttribute("data-scroll-locked") ||
  document.querySelector('[role="dialog"][data-state="open"]') !== null;

export function DrapeCoachmarkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onCatalogue = pathname === drapeLaunchConfig.coachmarkRoute;

  /*
   * Both the arming and the claim are stamped with the route they were made
   * on, and read back through it.
   *
   * A navigation therefore drops them on its own: no reset effect to forget,
   * and no claim left standing to reappear beside an unrelated button on the
   * next page. Nothing is marked seen — nobody was taught anything.
   */
  const [armedOn, setArmedOn] = useState<null | string>(null);
  const [claim, setClaim] = useState<null | { path: string; productId: string }>(
    null,
  );
  const armed = armedOn !== null && armedOn === pathname;
  const claimedProductId = claim?.path === pathname ? claim.productId : null;

  const elements = useRef(new Map<string, HTMLElement>());

  const register = useCallback((productId: string, element: HTMLElement | null) => {
    if (element) elements.current.set(productId, element);
    else elements.current.delete(productId);
  }, []);

  const unregister = useCallback((productId: string) => {
    elements.current.delete(productId);
  }, []);

  const arm = useCallback(() => {
    if (hasSeenDrapeCardCoachmark()) return;
    setArmedOn(pathname);
  }, [pathname]);

  const complete = useCallback(() => {
    markDrapeCardCoachmarkSeen();
    setArmedOn(null);
    setClaim(null);
  }, []);

  /*
   * Trigger — dwell on the catalogue.
   *
   * Counted rather than set as one timeout so a backgrounded tab cannot spend
   * the single showing this ever gets, and so a modal that happens to be open
   * at the two-second mark only postpones the lesson.
   */
  useEffect(() => {
    if (!onCatalogue || armed || claimedProductId) return;
    // Read here rather than in render: storage must never shape SSR output.
    if (hasSeenDrapeCardCoachmark()) return;

    let elapsed = 0;
    let last = Date.now();

    const tick = window.setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (document.visibilityState !== "visible") return;
      elapsed += delta;
      if (elapsed < drapeLaunchConfig.trigger.coachmarkDwellMs) return;
      if (aModalOwnsTheScreen()) return;
      setArmedOn(pathname);
    }, 250);

    const resync = () => {
      last = Date.now();
    };
    document.addEventListener("visibilitychange", resync);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [armed, claimedProductId, onCatalogue, pathname]);

  /*
   * Claim — the button nearest the middle of the screen.
   *
   * Re-asked on every scroll frame until one qualifies, rather than latched to
   * a single IntersectionObserver callback. An observer fires once per element
   * per crossing, so a modal open at that instant would have cost the lesson
   * its only chance to land.
   */
  useEffect(() => {
    if (!armed || claimedProductId) return;

    let frame = 0;

    const pick = () => {
      frame = 0;
      if (aModalOwnsTheScreen()) return;
      const nearest = pickCoachmarkTarget(elements.current, window.innerHeight);
      if (!nearest) return;
      setClaim({ path: pathname, productId: nearest });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(pick);
    };

    // The grid may still be laying out, so the first ask waits a frame.
    schedule();

    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    /* A card that mounts late — lazy images, a filter change — is a new answer. */
    const settle = window.setInterval(schedule, 400);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearInterval(settle);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [armed, claimedProductId, pathname]);

  const value = useMemo(
    () => ({
      arm,
      claimedProductId,
      complete,
      isShowing: claimedProductId !== null,
      register,
      unregister,
    }),
    [arm, claimedProductId, complete, register, unregister],
  );

  return (
    <DrapeCoachmarkContext.Provider value={value}>
      {children}
    </DrapeCoachmarkContext.Provider>
  );
}

/** Null outside the provider, so a trigger elsewhere simply renders plainly. */
export function useDrapeCoachmark(): DrapeCoachmarkValue | null {
  return useContext(DrapeCoachmarkContext);
}
