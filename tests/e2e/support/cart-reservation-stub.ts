import type { Page } from "@playwright/test";

/**
 * Write-safety shim for the storefront cart browser suite.
 *
 * The cart specs drive the REAL storefront: they open /collection, click a real
 * product card, and assert the drawer, badges, savings, and delivery card. Page
 * rendering is a database READ and is left untouched, so the assertions still
 * run against real catalogue data.
 *
 * The two endpoints that CHANGE state are not:
 *
 *   POST /api/v2/cart/reserve   holds a one-of-one piece for an hour
 *   POST /api/v2/cart/release   returns that hold
 *
 * Run unstubbed against the database in .env.local, those mutate live
 * inventory: a failed or interrupted run leaves real pieces reserved and
 * unbuyable for an hour, and a green suite silently depends on whichever pieces
 * happened to be free. Both are intercepted here so the suite performs ZERO
 * database writes while exercising exactly the same client code paths — the
 * store still receives a reservation token and expiry, and the drawer's own
 * availability logic still runs.
 *
 * Deliberately NOT stubbed: product stock reads, /collection, /cart, and the
 * wishlist endpoint. Those are reads, and stubbing them would hollow out the
 * assertions this suite exists to make.
 */

export type CartReservationStub = {
  /** Number of reserve calls intercepted. */
  readonly reserveCalls: number;
  /** Number of release calls intercepted. */
  readonly releaseCalls: number;
  /** Product ids currently held by the stub. */
  readonly heldProductIds: string[];
};

const RESERVATION_WINDOW_MS = 60 * 60 * 1000;

export async function installCartReservationStub(
  page: Page,
): Promise<CartReservationStub> {
  const held = new Map<string, string>();
  let reserveCalls = 0;
  let releaseCalls = 0;

  await page.route("**/api/v2/cart/reserve", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();

    reserveCalls += 1;
    const body = (request.postDataJSON() ?? {}) as { productId?: string };
    const token = `e2e-reservation-${reserveCalls}`;
    if (body.productId) held.set(body.productId, token);

    await route.fulfill({
      status: 200,
      json: {
        reservationToken: token,
        reservedUntil: new Date(Date.now() + RESERVATION_WINDOW_MS).toISOString(),
      },
    });
  });

  await page.route("**/api/v2/cart/release", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();

    releaseCalls += 1;
    const body = (request.postDataJSON() ?? {}) as { productId?: string };
    if (body.productId) held.delete(body.productId);

    await route.fulfill({ status: 200, json: { released: true } });
  });

  return {
    get reserveCalls() {
      return reserveCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
    get heldProductIds() {
      return [...held.keys()];
    },
  };
}
