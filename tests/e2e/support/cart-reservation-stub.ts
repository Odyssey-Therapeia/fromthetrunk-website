import { expect, type Page, type Request, type Route } from "@playwright/test";

import { installWriteGuard, type BlockedWrite } from "./storefront-guard";

/**
 * In-memory commerce server for the storefront e2e specs.
 *
 * Pages still render the real catalogue, but every account-scoped or mutating
 * commerce request is answered here, so the suite performs no database write.
 * The contracts follow the real routes:
 *
 *   POST   /api/v2/products/viewer-state  { productIds } (1-200)
 *          -> { products: { [id]: { state, reservedUntil } } }
 *          (api/hono/routes/products.ts, lib/commerce/viewer-state.ts)
 *   GET    /api/v2/cart/items             -> { items: [...line, viewerState] }
 *   POST   /api/v2/cart/items             { productId, selectedOptions? }
 *   DELETE /api/v2/cart/items/:productId  -> 200 { productId, reason, released,
 *          removed, viewerState } (api/hono/routes/cart.ts)
 *   GET, POST, DELETE /api/v2/wishlist, POST /api/v2/wishlist/notify
 *   POST   /api/v2/auth/otp/start, /api/v2/auth/otp/verify
 *   GET    /api/auth/session | csrf | providers
 *   POST   /api/auth/session (useSession().update), /api/auth/callback/email-otp,
 *          /api/auth/signout
 *
 * Every verdict is controllable per product, including a malformed entry, an
 * omitted entry, a failed or malformed response, and held (delayed) session,
 * viewer-state and DELETE answers. Anything else that writes is aborted by the
 * write guard and listed in `blockedWrites`.
 */

export type ViewerProductState =
  | "available"
  | "in_my_cart"
  | "payment_pending"
  | "reserved_by_other"
  | "sold";

/** A real verdict, an entry the client must not trust, or no entry at all. */
export type VerdictSetting = ViewerProductState | "malformed" | "omitted";

/** "http-error" answers 503; "malformed-body" answers 200 with no products map. */
export type ViewerStateResponseMode = "http-error" | "malformed-body" | "ok";

export type RemovalReason =
  | "ALREADY_REMOVED"
  | "PAYMENT_IN_PROGRESS"
  | "RELEASED"
  | "REMOVED_PAYMENT_PROTECTED"
  | "SOLD"
  | "STALE_ROW"
  | "UNRESERVED";

export type StubAccount = { email: string; id: string; name: string };

export type StubBagLine = {
  name?: string;
  originalPricePaise?: null | number;
  pricePaise?: number;
  productId: string;
  /** Omit for a one-hour hold; null for an unreserved (made-to-order) line. */
  reservedUntil?: null | string;
  slug?: string;
  status?: "active" | "payment_pending";
};

export const E2E_SHOPPER: StubAccount = {
  email: "e2e-cart-shopper@example.test",
  id: "e2e0c0de-0000-4000-8000-000000000001",
  name: "E2E Cart Shopper",
};

/** The only code the stubbed OTP verify accepts. */
export const E2E_OTP_CODE = "246810";

const E2E_CHALLENGE_TOKEN = "e2e-otp-challenge";
const E2E_LOGIN_TICKET = "e2e-login-ticket";
const E2E_CSRF_TOKEN = "e2e-csrf-token";
const HOLD_WINDOW_MS = 60 * 60 * 1000;
const OTHER_SHOPPER_HOLD_MS = 30 * 60 * 1000;
const MAX_VIEWER_STATE_IDS = 200;

const VIEWER_STATES = new Set<string>([
  "available",
  "in_my_cart",
  "payment_pending",
  "reserved_by_other",
  "sold",
]);

const isViewerState = (value: unknown): value is ViewerProductState =>
  typeof value === "string" && VIEWER_STATES.has(value);

const ownsPiece = (setting: VerdictSetting) =>
  setting === "in_my_cart" || setting === "payment_pending";

const ownsNothing = (setting: VerdictSetting) =>
  setting === "available" ||
  setting === "reserved_by_other" ||
  setting === "sold";

type StoredLine = {
  addedAt: string;
  name: string;
  originalPricePaise: null | number;
  pricePaise: number;
  productId: string;
  reservedUntil: null | string;
  selectedOptions: null | Record<string, unknown>;
  slug: string;
  status: "active" | "payment_pending";
};

type Gate = { promise: Promise<void>; release: () => void };

const openGate = (): Gate => {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

export type CommerceStubOptions = {
  /** Who /api/auth/session says is signed in. Defaults to signed out. */
  account?: null | StubAccount;
  /**
   * Awaited whenever the stubbed sign-in or sign-out endpoint changes the
   * session, so a spec can move the real session cookie that proxy.ts checks.
   */
  onSessionChange?: (account: null | StubAccount) => Promise<void> | void;
};

export type CommerceStub = {
  readonly account: null | StubAccount;
  readonly addCalls: number;
  /** Mutating requests nothing stubbed; each one was aborted. */
  readonly blockedWrites: readonly BlockedWrite[];
  readonly notifyCalls: number;
  readonly otpStartCalls: number;
  readonly otpVerifyCalls: number;
  /** The signed-in account's bag, or [] when signed out. */
  readonly productIds: string[];
  readonly removeCalls: number;
  readonly signInCalls: number;
  readonly signOutCalls: number;
  /** The productIds of every viewer-state request, in arrival order. */
  readonly viewerStateRequests: readonly (readonly string[])[];
  readonly wishlistWrites: number;
  bagProductIds: (accountId: string) => string[];
  /** Hold every DELETE until the returned release runs. */
  holdDeletes: () => () => void;
  /** Hold GET /api/auth/session, keeping the client session "loading". */
  holdSession: () => () => void;
  /** Hold viewer-state answers; verdicts are read when released. */
  holdViewerState: () => () => void;
  seedBag: (accountId: string, lines: StubBagLine[]) => void;
  seedWishlist: (accountId: string, productIds: string[]) => void;
  /** The verdict for any product with no override and no bag line. */
  setDefaultVerdict: (setting: VerdictSetting) => void;
  /** Override how DELETE answers for one product; null restores the default. */
  setDeleteOutcome: (productId: string, reason: null | RemovalReason) => void;
  /** The account the next successful email OTP sign-in becomes. */
  setNextSignIn: (account: null | StubAccount) => void;
  /** Override one product's verdict; null clears the override. */
  setVerdict: (productId: string, setting: null | VerdictSetting) => void;
  setViewerStateMode: (mode: ViewerStateResponseMode) => void;
  /** Change the session answer directly (no cookie, no callback). */
  signInAs: (account: null | StubAccount) => void;
  wishlistIds: (accountId: string) => string[];
};

const pathIs = (pathname: string) => (url: URL) => url.pathname === pathname;

const readJson = (request: Request): unknown => {
  try {
    return request.postDataJSON() as unknown;
  } catch {
    return null;
  }
};

const readForm = (request: Request) =>
  new URLSearchParams(request.postData() ?? "");

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route
    .fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      status,
    })
    // The page may close while a held answer is still waiting.
    .catch(() => undefined);

const sessionBody = (account: StubAccount) => ({
  expires: "2099-01-01T00:00:00.000Z",
  user: { email: account.email, id: account.id, name: account.name },
});

const unauthenticated = (route: Route) =>
  fulfillJson(route, 401, {
    code: "UNAUTHENTICATED",
    message: "Authentication required.",
  });

export async function installCommerceStub(
  page: Page,
  options: CommerceStubOptions = {},
): Promise<CommerceStub> {
  // First, so every stub below takes precedence over it.
  const blockedWrites = await installWriteGuard(page);

  let account: null | StubAccount = options.account ?? null;
  let nextSignIn: null | StubAccount = null;
  let defaultVerdict: VerdictSetting = "available";
  let viewerStateMode: ViewerStateResponseMode = "ok";

  const bags = new Map<string, Map<string, StoredLine>>();
  const wishlists = new Map<string, string[]>();
  const overrides = new Map<string, VerdictSetting>();
  const deleteOutcomes = new Map<string, RemovalReason>();
  /*
   * account|product pairs whose last served verdict owned nothing. The real
   * GET prunes such lines (pruneUnownedCartRows); here that happens on the
   * first bag read after the client has been told, so a checkout snapshot and
   * its preflight can disagree exactly as they do in a real race.
   */
  const servedUnowned = new Set<string>();
  const viewerStateRequests: string[][] = [];
  const gates: Record<"delete" | "session" | "viewerState", Gate | null> = {
    delete: null,
    session: null,
    viewerState: null,
  };
  const counts = {
    add: 0,
    notify: 0,
    otpStart: 0,
    otpVerify: 0,
    remove: 0,
    signIn: 0,
    signOut: 0,
    wishlistWrites: 0,
  };

  const holdGate = (name: keyof typeof gates) => {
    const gate = openGate();
    gates[name] = gate;
    return () => {
      if (gates[name] === gate) gates[name] = null;
      gate.release();
    };
  };
  const passGate = async (name: keyof typeof gates) => {
    const gate = gates[name];
    if (gate) await gate.promise;
  };

  const bagOf = (accountId: string) => {
    let bag = bags.get(accountId);
    if (!bag) {
      bag = new Map();
      bags.set(accountId, bag);
    }
    return bag;
  };
  const servedKey = (productId: string) =>
    `${account?.id ?? "signed-out"}|${productId}`;
  const currentLine = (productId: string) =>
    account ? bags.get(account.id)?.get(productId) : undefined;

  const resolveVerdict = (productId: string): VerdictSetting => {
    const override = overrides.get(productId);
    if (override) return override;
    const line = currentLine(productId);
    if (line) {
      return line.status === "payment_pending" ? "payment_pending" : "in_my_cart";
    }
    return defaultVerdict;
  };

  const verdictEntry = (productId: string, setting: VerdictSetting) => {
    switch (setting) {
      case "omitted":
        return undefined;
      case "malformed":
        // The retired stock vocabulary: well-formed JSON, untrusted state.
        return { reservedUntil: 0, state: "reserved" };
      case "in_my_cart":
      case "payment_pending": {
        const line = currentLine(productId);
        return {
          reservedUntil: line
            ? line.reservedUntil
            : new Date(Date.now() + HOLD_WINDOW_MS).toISOString(),
          state: setting,
        };
      }
      case "reserved_by_other":
        return {
          reservedUntil: new Date(Date.now() + OTHER_SHOPPER_HOLD_MS).toISOString(),
          state: setting,
        };
      default:
        return { reservedUntil: null, state: setting };
    }
  };

  const toResponseLine = (line: StoredLine) => {
    const verdict = resolveVerdict(line.productId);
    return {
      addedAt: line.addedAt,
      detailsFabric: "E2E silk",
      imageAlt: line.name,
      imageUrl: "",
      name: line.name,
      originalPricePaise: line.originalPricePaise,
      pricePaise: line.pricePaise,
      productId: line.productId,
      reservedUntil: line.reservedUntil,
      selectedOptions: line.selectedOptions,
      slug: line.slug,
      status: line.status,
      ...(isViewerState(verdict) ? { viewerState: verdict } : {}),
    };
  };

  const storeLine = (accountId: string, input: StubBagLine): StoredLine => {
    const line: StoredLine = {
      addedAt: new Date().toISOString(),
      name: input.name ?? "E2E authenticated cart item",
      originalPricePaise:
        input.originalPricePaise === undefined ? 200_000 : input.originalPricePaise,
      pricePaise: input.pricePaise ?? 150_000,
      productId: input.productId,
      reservedUntil:
        input.reservedUntil === undefined
          ? new Date(Date.now() + HOLD_WINDOW_MS).toISOString()
          : input.reservedUntil,
      selectedOptions: null,
      slug: input.slug ?? "e2e-authenticated-cart-item",
      status: input.status ?? "active",
    };
    bagOf(accountId).set(line.productId, line);
    servedUnowned.delete(`${accountId}|${line.productId}`);
    return line;
  };

  // ── Session and next-auth ────────────────────────────────────────────────

  await page.route(pathIs("/api/auth/session"), async (route) => {
    const method = route.request().method();
    if (method === "GET") await passGate("session");
    else if (method !== "POST") return route.fallback();
    await fulfillJson(route, 200, account ? sessionBody(account) : {});
  });

  await page.route(pathIs("/api/auth/csrf"), async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await fulfillJson(route, 200, { csrfToken: E2E_CSRF_TOKEN });
  });

  await page.route(pathIs("/api/auth/providers"), async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const origin = new URL(route.request().url()).origin;
    await fulfillJson(route, 200, {
      "email-otp": {
        callbackUrl: `${origin}/api/auth/callback/email-otp`,
        id: "email-otp",
        name: "Email OTP",
        signinUrl: `${origin}/api/auth/signin/email-otp`,
        type: "credentials",
      },
    });
  });

  await page.route(pathIs("/api/auth/callback/email-otp"), async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const origin = new URL(request.url()).origin;
    const form = readForm(request);
    if (!nextSignIn || form.get("loginTicket") !== E2E_LOGIN_TICKET) {
      await fulfillJson(route, 401, {
        url: `${origin}/api/auth/error?error=CredentialsSignin`,
      });
      return;
    }
    counts.signIn += 1;
    account = nextSignIn;
    nextSignIn = null;
    await options.onSessionChange?.(account);
    await fulfillJson(route, 200, { url: form.get("callbackUrl") ?? `${origin}/` });
  });

  await page.route(pathIs("/api/auth/signout"), async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const origin = new URL(request.url()).origin;
    counts.signOut += 1;
    account = null;
    await options.onSessionChange?.(null);
    await fulfillJson(route, 200, {
      url: readForm(request).get("callbackUrl") ?? `${origin}/`,
    });
  });

  // ── Email OTP (components/commerce/commerce-auth-dialog.tsx) ──────────────

  await page.route(pathIs("/api/v2/auth/otp/start"), async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    counts.otpStart += 1;
    const body = readJson(request) as { identifier?: unknown } | null;
    const identifier = typeof body?.identifier === "string" ? body.identifier : "";
    const [local = "", domain = "example.test"] = identifier.split("@");
    await fulfillJson(route, 200, {
      challengeToken: E2E_CHALLENGE_TOKEN,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      maskedEmail: `${local.slice(0, 1)}***@${domain}`,
      ok: true,
      resendAvailableAt: new Date(Date.now() + 30 * 1000).toISOString(),
    });
  });

  await page.route(pathIs("/api/v2/auth/otp/verify"), async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    counts.otpVerify += 1;
    const body = readJson(request) as { challengeToken?: unknown; otp?: unknown } | null;
    if (body?.challengeToken !== E2E_CHALLENGE_TOKEN || body?.otp !== E2E_OTP_CODE) {
      await fulfillJson(route, 400, {
        code: "INVALID_OR_EXPIRED_OTP",
        message: "Invalid or expired code.",
      });
      return;
    }
    await fulfillJson(route, 200, {
      mode: "sign_in",
      ok: true,
      ticket: E2E_LOGIN_TICKET,
    });
  });

  // ── Viewer state ──────────────────────────────────────────────────────────

  await page.route(pathIs("/api/v2/products/viewer-state"), async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();

    const body = readJson(request) as { productIds?: unknown } | null;
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.filter((id): id is string => typeof id === "string")
      : [];
    viewerStateRequests.push(productIds);
    await passGate("viewerState");

    if (viewerStateMode === "http-error") {
      await fulfillJson(route, 503, {
        code: "E2E_VIEWER_STATE_UNAVAILABLE",
        message: "Deterministic viewer-state failure.",
      });
      return;
    }
    if (viewerStateMode === "malformed-body") {
      await fulfillJson(route, 200, { verdicts: productIds });
      return;
    }
    if (productIds.length === 0 || productIds.length > MAX_VIEWER_STATE_IDS) {
      await fulfillJson(route, 400, {
        code: "INVALID_PRODUCT_IDS",
        message: `productIds must hold 1 to ${MAX_VIEWER_STATE_IDS} ids.`,
      });
      return;
    }

    const products: Record<string, unknown> = {};
    for (const productId of productIds) {
      const verdict = resolveVerdict(productId);
      const entry = verdictEntry(productId, verdict);
      if (entry) products[productId] = entry;
      if (ownsNothing(verdict)) servedUnowned.add(servedKey(productId));
      else servedUnowned.delete(servedKey(productId));
    }
    await fulfillJson(route, 200, { products });
  });

  // ── Bag ───────────────────────────────────────────────────────────────────

  await page.route(pathIs("/api/v2/cart/items"), async (route) => {
    const request = route.request();
    const method = request.method();
    if (method !== "GET" && method !== "POST") return route.fallback();
    if (!account) return unauthenticated(route);
    const bag = bagOf(account.id);

    if (method === "GET") {
      for (const [productId] of bag) {
        if (servedUnowned.has(servedKey(productId)) && ownsNothing(resolveVerdict(productId))) {
          bag.delete(productId);
        }
      }
      await fulfillJson(route, 200, { items: [...bag.values()].map(toResponseLine) });
      return;
    }

    counts.add += 1;
    const body = readJson(request) as {
      productId?: unknown;
      selectedOptions?: unknown;
    } | null;
    const productId = typeof body?.productId === "string" ? body.productId : "";
    if (!productId) {
      await fulfillJson(route, 400, {
        code: "INVALID_PRODUCT",
        message: "productId is required.",
      });
      return;
    }

    const verdict = resolveVerdict(productId);
    if (verdict === "sold") {
      await fulfillJson(route, 409, {
        code: "PRODUCT_SOLD",
        message: "This saree has found its next home.",
        viewerState: "sold",
      });
      return;
    }
    if (verdict === "reserved_by_other") {
      await fulfillJson(route, 409, {
        code: "PRODUCT_RESERVED",
        message: "This piece has just been reserved.",
        viewerState: "reserved_by_other",
      });
      return;
    }

    const existing = bag.get(productId);
    if (existing && ownsPiece(verdict)) {
      // The holder asking again gets the same hold back, unextended.
      await fulfillJson(route, 200, {
        item: toResponseLine(existing),
        viewerState: verdict,
      });
      return;
    }

    overrides.delete(productId);
    const line = storeLine(account.id, { productId });
    if (body?.selectedOptions && typeof body.selectedOptions === "object") {
      line.selectedOptions = body.selectedOptions as Record<string, unknown>;
    }
    await fulfillJson(route, 200, {
      item: toResponseLine(line),
      viewerState: "in_my_cart",
    });
  });

  await page.route(
    (url) => url.pathname.startsWith("/api/v2/cart/items/"),
    async (route) => {
      const request = route.request();
      if (request.method() !== "DELETE") return route.fallback();
      if (!account) return unauthenticated(route);
      counts.remove += 1;
      await passGate("delete");
      // The shopper may have signed out while the answer was held.
      if (!account) return unauthenticated(route);

      const productId = decodeURIComponent(
        new URL(request.url()).pathname.split("/").at(-1) ?? "",
      );
      const bag = bagOf(account.id);
      const line = bag.get(productId);

      const answer = (
        reason: RemovalReason,
        removed: boolean,
        released: boolean,
        viewerState: ViewerProductState,
      ) => fulfillJson(route, 200, { productId, reason, released, removed, viewerState });

      if (!line) {
        const verdict = resolveVerdict(productId);
        await answer(
          "ALREADY_REMOVED",
          true,
          false,
          isViewerState(verdict) ? verdict : "available",
        );
        return;
      }

      const reason =
        deleteOutcomes.get(productId) ??
        (line.reservedUntil == null ? "UNRESERVED" : "RELEASED");

      switch (reason) {
        case "PAYMENT_IN_PROGRESS":
          // removed:false — the line and its hold stay, now mid-payment.
          line.status = "payment_pending";
          overrides.delete(productId);
          await answer(reason, false, false, "payment_pending");
          return;
        case "RELEASED":
          bag.delete(productId);
          overrides.delete(productId);
          await answer(reason, true, true, "available");
          return;
        case "UNRESERVED":
        case "ALREADY_REMOVED":
          bag.delete(productId);
          overrides.delete(productId);
          await answer(reason, true, false, "available");
          return;
        case "STALE_ROW":
        case "REMOVED_PAYMENT_PROTECTED":
          // The line goes; the hold on the piece does not.
          bag.delete(productId);
          overrides.set(productId, "reserved_by_other");
          await answer(reason, true, false, "reserved_by_other");
          return;
        case "SOLD":
          bag.delete(productId);
          overrides.set(productId, "sold");
          await answer(reason, true, false, "sold");
          return;
      }
    },
  );

  // ── Wishlist and Notify me ───────────────────────────────────────────────

  await page.route(pathIs("/api/v2/wishlist"), async (route) => {
    const request = route.request();
    const method = request.method();
    if (method !== "GET" && method !== "POST" && method !== "DELETE") {
      return route.fallback();
    }
    if (!account) return unauthenticated(route);
    const ids = wishlists.get(account.id) ?? [];

    if (method === "GET") {
      await fulfillJson(route, 200, ids);
      return;
    }

    counts.wishlistWrites += 1;
    const body = readJson(request) as { productId?: unknown } | null;
    const productId = typeof body?.productId === "string" ? body.productId : "";
    wishlists.set(
      account.id,
      method === "POST"
        ? ids.includes(productId)
          ? ids
          : [...ids, productId]
        : ids.filter((id) => id !== productId),
    );
    await fulfillJson(route, 200, { success: true });
  });

  await page.route(pathIs("/api/v2/wishlist/notify"), async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (!account) return unauthenticated(route);
    counts.notify += 1;
    await fulfillJson(route, 200, { success: true });
  });

  return {
    get account() {
      return account;
    },
    get addCalls() {
      return counts.add;
    },
    blockedWrites,
    get notifyCalls() {
      return counts.notify;
    },
    get otpStartCalls() {
      return counts.otpStart;
    },
    get otpVerifyCalls() {
      return counts.otpVerify;
    },
    get productIds() {
      return account ? [...bagOf(account.id).keys()] : [];
    },
    get removeCalls() {
      return counts.remove;
    },
    get signInCalls() {
      return counts.signIn;
    },
    get signOutCalls() {
      return counts.signOut;
    },
    viewerStateRequests,
    get wishlistWrites() {
      return counts.wishlistWrites;
    },
    bagProductIds: (accountId) => [...bagOf(accountId).keys()],
    holdDeletes: () => holdGate("delete"),
    holdSession: () => holdGate("session"),
    holdViewerState: () => holdGate("viewerState"),
    seedBag: (accountId, lines) => {
      for (const line of lines) storeLine(accountId, line);
    },
    seedWishlist: (accountId, productIds) => {
      wishlists.set(accountId, [...productIds]);
    },
    setDefaultVerdict: (setting) => {
      defaultVerdict = setting;
    },
    setDeleteOutcome: (productId, reason) => {
      if (reason) deleteOutcomes.set(productId, reason);
      else deleteOutcomes.delete(productId);
    },
    setNextSignIn: (nextAccount) => {
      nextSignIn = nextAccount;
    },
    setVerdict: (productId, setting) => {
      if (setting) overrides.set(productId, setting);
      else overrides.delete(productId);
    },
    setViewerStateMode: (mode) => {
      viewerStateMode = mode;
    },
    signInAs: (nextAccount) => {
      account = nextAccount;
    },
    wishlistIds: (accountId) => [...(wishlists.get(accountId) ?? [])],
  };
}

/**
 * Make the collection poller ask again now and wait until it has.
 *
 * `ftt:cart-updated` is the poller's own "the bag changed here" signal
 * (lib/realtime/use-collection-stock.tsx): it queues behind a request in
 * flight and goes ahead of a failure back-off, so the next answer always
 * reflects whatever verdict the spec has just set. It is re-sent on every
 * poll in case the provider had not subscribed yet.
 */
export async function refreshViewerState(
  page: Page,
  commerce: Pick<CommerceStub, "viewerStateRequests">,
): Promise<void> {
  const before = commerce.viewerStateRequests.length;
  await expect
    .poll(
      async () => {
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent("ftt:cart-updated")),
        );
        return commerce.viewerStateRequests.length;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(before);
}

/**
 * The opaque cross-tab bell lib/commerce/cart-tab-bus.ts rings: the bag and
 * the card verdicts re-read from the server, as when another tab changed it.
 */
export async function announceBagChangedInAnotherTab(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ftt-cart-sync-v1",
        newValue: `${Date.now()}:1`,
      }),
    ),
  );
}
