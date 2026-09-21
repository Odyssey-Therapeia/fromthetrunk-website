/**
 * When the welcome popup may appear.
 *
 * The popup is an invitation, not a task, so it gives way to anything the
 * shopper is actually doing. It once opened on top of the sign-in email
 * dialog: Radix had locked pointer input to that dialog, so nothing on the
 * welcome card could be clicked, and the click meant for it landed "outside"
 * the dialog and closed it. So the popup now waits:
 *
 *  - off every route where the shopper signs in, checks out or pays;
 *  - while the Drape Room or the sign-in dialog is open;
 *  - while any other modal owns the screen or the shopper is typing, and for
 *    a short settle afterwards, so it never lands mid-interaction.
 */

/**
 * Route prefixes where the popup never renders, matched against the real
 * route tree. Sign-in, sign-up, email verification and Repay on an unpaid
 * order all live under /account; the payment step and its confirmation under
 * /checkout; /cart is the step straight before it.
 */
export const WELCOME_POPUP_EXCLUDED_ROUTE_PREFIXES = [
  "/account",
  "/cart",
  "/checkout",
] as const;

/** How long the page must stay free of modals and typing before it opens. */
export const WELCOME_POPUP_SETTLE_MS = 5_000;

/** True on routes where the welcome popup must never render. */
export function isWelcomePopupExcludedRoute(pathname: string | null): boolean {
  // An unknown route stays out of the way rather than risk covering checkout.
  if (!pathname) return true;
  return WELCOME_POPUP_EXCLUDED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export type WelcomePopupMountInput = {
  pathname: string | null;
  /** The Drape Room presentation is on screen. */
  drapeRoomOpen: boolean;
  /** The shared email + six-digit-code sign-in dialog is on screen. */
  commerceAuthDialogOpen: boolean;
};

/**
 * Whether the popup may be mounted at all.
 *
 * The caller unmounts it rather than hiding it, on purpose: once the blocker
 * is gone the popup mounts afresh and waits out its whole browsing delay
 * again, instead of landing the moment the shopper finishes signing in.
 */
export function canMountWelcomePopup({
  commerceAuthDialogOpen,
  drapeRoomOpen,
  pathname,
}: WelcomePopupMountInput): boolean {
  return (
    !drapeRoomOpen &&
    !commerceAuthDialogOpen &&
    !isWelcomePopupExcludedRoute(pathname)
  );
}

/**
 * True while a modal other than the welcome popup owns the screen.
 *
 * Every Radix dialog and sheet — the sign-in dialog, the cart drawer, search —
 * marks the body with data-scroll-locked and sets pointer-events: none on it.
 * That second lock is exactly what left the welcome card unclickable. The
 * hand-rolled modals (review form, mobile filters) carry only role="dialog",
 * so an open dialog role counts as well, minus a Radix one animating closed.
 */
export function anotherModalIsOpen(doc: Document): boolean {
  const body = doc.body;
  if (!body) return false;
  if (body.hasAttribute("data-scroll-locked")) return true;
  if (body.style.pointerEvents === "none") return true;

  const dialogs = doc.querySelectorAll(
    "[role='dialog']:not([data-ftt-welcome-popup]), [role='alertdialog']",
  );
  for (const dialog of dialogs) {
    if (dialog.getAttribute("data-state") === "closed") continue;
    return true;
  }
  return false;
}

/**
 * Input types that take no typed text. A checkbox or button keeps focus after
 * a click, and counting that as typing would hold the popup back indefinitely.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** True while focus sits in a field the shopper types into. */
export function shopperIsTyping(doc: Document): boolean {
  const active = doc.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.tagName === "TEXTAREA") return true;
  if (active.tagName === "INPUT") {
    return !NON_TEXT_INPUT_TYPES.has((active as HTMLInputElement).type);
  }
  return active.isContentEditable === true;
}

export type WelcomeRevealInput = {
  /** The browsing delay has run out. */
  elapsed: boolean;
  /** The shopper has scrolled past the threshold at least once. */
  scrolled: boolean;
  /** A modal is open or the shopper is typing, right now. */
  busy: boolean;
  now: number;
  /** When the page was last seen busy; null if never. */
  lastBusyAt: number | null;
};

export type WelcomeRevealDecision = {
  open: boolean;
  lastBusyAt: number | null;
};

/**
 * One tick of the reveal decision.
 *
 * Busy is sampled on every tick, before the delay is up too, so a shopper who
 * was typing at 19 seconds still gets the full settle window at 20.
 */
export function decideWelcomeReveal({
  busy,
  elapsed,
  lastBusyAt,
  now,
  scrolled,
}: WelcomeRevealInput): WelcomeRevealDecision {
  if (busy) return { lastBusyAt: now, open: false };

  const settled =
    lastBusyAt === null || now - lastBusyAt >= WELCOME_POPUP_SETTLE_MS;
  return { lastBusyAt, open: elapsed && scrolled && settled };
}
