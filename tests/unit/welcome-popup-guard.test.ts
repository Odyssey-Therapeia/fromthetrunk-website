// @vitest-environment jsdom
/**
 * When the welcome popup may appear.
 *
 * It opened over the sign-in email dialog, whose pointer lock left the welcome
 * card unclickable and turned the click meant for it into a dismissal of the
 * dialog behind. These cases pin the rules that keep it out of the way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  anotherModalIsOpen,
  canMountWelcomePopup,
  decideWelcomeReveal,
  isWelcomePopupExcludedRoute,
  shopperIsTyping,
  WELCOME_POPUP_SETTLE_MS,
} from "@/lib/widgets/welcome-popup-guard";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("data-scroll-locked");
  document.body.style.pointerEvents = "";
});

describe("welcome popup routes", () => {
  it.each([
    "/account/sign-in",
    "/account/sign-up",
    "/account/profile/verify-email",
    "/account/orders/ord_123",
    "/account",
    "/cart",
    "/checkout",
    "/checkout/confirmation",
  ])("stays off %s", (pathname) => {
    expect(isWelcomePopupExcludedRoute(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/collection",
    "/collection/banarasi-silk",
    "/search",
    "/accounts",
    "/checkout-help",
  ])("may appear on %s", (pathname) => {
    expect(isWelcomePopupExcludedRoute(pathname)).toBe(false);
  });

  it("stays off when the route is unknown", () => {
    expect(isWelcomePopupExcludedRoute(null)).toBe(true);
  });
});

describe("welcome popup mounting", () => {
  const browsing = {
    commerceAuthDialogOpen: false,
    drapeRoomOpen: false,
    pathname: "/collection",
  };

  it("mounts while the shopper is simply browsing", () => {
    expect(canMountWelcomePopup(browsing)).toBe(true);
  });

  it("unmounts while the sign-in email dialog is open", () => {
    expect(
      canMountWelcomePopup({ ...browsing, commerceAuthDialogOpen: true }),
    ).toBe(false);
  });

  it("unmounts while the Drape Room is open", () => {
    expect(canMountWelcomePopup({ ...browsing, drapeRoomOpen: true })).toBe(
      false,
    );
  });

  it("unmounts on checkout even with nothing else open", () => {
    expect(canMountWelcomePopup({ ...browsing, pathname: "/checkout" })).toBe(
      false,
    );
  });
});

describe("competing modals", () => {
  it("sees nothing on a quiet page", () => {
    expect(anotherModalIsOpen(document)).toBe(false);
  });

  it("sees an open Radix dialog such as sign-in or the cart drawer", () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    expect(anotherModalIsOpen(document)).toBe(true);
  });

  it("ignores a Radix dialog that is animating closed", () => {
    document.body.innerHTML = '<div role="dialog" data-state="closed"></div>';
    expect(anotherModalIsOpen(document)).toBe(false);
  });

  it("sees a hand-rolled modal that only carries the dialog role", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(anotherModalIsOpen(document)).toBe(true);
  });

  it("sees the Radix body pointer lock that made the card unclickable", () => {
    document.body.style.pointerEvents = "none";
    expect(anotherModalIsOpen(document)).toBe(true);
  });

  it("sees the Radix body scroll lock", () => {
    document.body.setAttribute("data-scroll-locked", "1");
    expect(anotherModalIsOpen(document)).toBe(true);
  });

  it("never counts the welcome popup itself", () => {
    document.body.innerHTML =
      '<div role="dialog" aria-modal="true" data-ftt-welcome-popup=""></div>';
    expect(anotherModalIsOpen(document)).toBe(false);
  });
});

describe("typing", () => {
  const focusFirst = (html: string) => {
    document.body.innerHTML = html;
    (document.body.firstElementChild as HTMLElement).focus();
  };

  it("sees the sign-in email field", () => {
    focusFirst('<input type="email" />');
    expect(shopperIsTyping(document)).toBe(true);
  });

  it("sees a textarea and an input with no type", () => {
    focusFirst("<textarea></textarea>");
    expect(shopperIsTyping(document)).toBe(true);

    focusFirst("<input />");
    expect(shopperIsTyping(document)).toBe(true);
  });

  it("does not treat a focused checkbox or button as typing", () => {
    focusFirst('<input type="checkbox" />');
    expect(shopperIsTyping(document)).toBe(false);

    focusFirst('<button type="button">Add to bag</button>');
    expect(shopperIsTyping(document)).toBe(false);
  });

  it("sees nothing while focus rests on the page", () => {
    expect(shopperIsTyping(document)).toBe(false);
  });
});

describe("reveal timing", () => {
  const ready = {
    busy: false,
    elapsed: true,
    lastBusyAt: null,
    now: 100_000,
    scrolled: true,
  };

  it("opens once the delay is up, the shopper has scrolled, and all is quiet", () => {
    expect(decideWelcomeReveal(ready)).toEqual({ lastBusyAt: null, open: true });
  });

  it("waits for the browsing delay and for a scroll", () => {
    expect(decideWelcomeReveal({ ...ready, elapsed: false }).open).toBe(false);
    expect(decideWelcomeReveal({ ...ready, scrolled: false }).open).toBe(false);
  });

  it("holds while busy and remembers when", () => {
    expect(decideWelcomeReveal({ ...ready, busy: true })).toEqual({
      lastBusyAt: ready.now,
      open: false,
    });
  });

  it("waits out the settle window once the page goes quiet", () => {
    expect(
      decideWelcomeReveal({
        ...ready,
        lastBusyAt: ready.now - WELCOME_POPUP_SETTLE_MS + 1,
      }).open,
    ).toBe(false);
    expect(
      decideWelcomeReveal({
        ...ready,
        lastBusyAt: ready.now - WELCOME_POPUP_SETTLE_MS,
      }).open,
    ).toBe(true);
  });

  it("counts typing that happened before the delay was up", () => {
    const typing = decideWelcomeReveal({
      ...ready,
      busy: true,
      elapsed: false,
      now: 19_000,
    });
    expect(typing).toEqual({ lastBusyAt: 19_000, open: false });

    expect(
      decideWelcomeReveal({ ...ready, lastBusyAt: typing.lastBusyAt, now: 20_000 })
        .open,
    ).toBe(false);
  });
});

describe("welcome popup wiring", () => {
  const popup = readFileSync(
    join(process.cwd(), "components/widgets/welcome-popup.tsx"),
    "utf8",
  );

  it("asks both guards on every beat until it opens", () => {
    expect(popup).toContain(
      "busy: anotherModalIsOpen(document) || shopperIsTyping(document)",
    );
    expect(popup).toContain("window.clearInterval(beat)");
  });

  it("marks its own dialog so it never waits on itself", () => {
    expect(popup).toContain("data-ftt-welcome-popup");
  });

  it("gives way to a modal that opens over it without marking itself seen", () => {
    // The bag drawer can land after the card is already up, at the end of an
    // add-to-bag animation, and would bring the pointer-lock bug straight back.
    const start = popup.indexOf("const watch = window.setInterval");
    expect(start).toBeGreaterThan(-1);

    const yieldGuard = popup.slice(start, popup.indexOf("}, [open]);", start));
    expect(yieldGuard).toContain("if (!anotherModalIsOpen(document)) return;");
    expect(yieldGuard).toContain("setOpen(false);");
    expect(yieldGuard).toContain("setArmCount((count) => count + 1);");
    expect(yieldGuard).not.toContain("WELCOME_SEEN_KEY");
    // Re-arming restarts the whole reveal, delay and settle window included.
    expect(popup).toContain("}, [armCount]);");
  });
});
