/**
 * One verdict per bag line, proven by rendering the surfaces themselves.
 *
 * The drawer, the full bag page and the checkout summary used to decide the
 * trash and the "Reserved for you" copy from the cart row's status. A row only
 * proves a row exists: it cannot say "sold" and cannot see another shopper's
 * hold, so a line could offer removal and checkout over a piece its own card
 * called "Notify me". These tests drive the shared viewer-state hook and read
 * what each surface actually renders.
 */

// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // The cart store binds persist storage at import time; Node's native
  // localStorage throws without a backing file, so give it an in-memory one.
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      removeItem: (key: string) => void memory.delete(key),
      setItem: (key: string, value: string) => void memory.set(key, value),
    },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

type Verdict =
  | "available"
  | "checking"
  | "in_my_cart"
  | "payment_pending"
  | "reserved_by_other"
  | "sold";

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  });
  return {
    // Stable across renders, as the real hooks' are, so the checkout's
    // preflight runs once per mount rather than once per render.
    addressesQuery: {
      data: [],
      isSuccess: true,
      refetch: vi.fn(async () => undefined),
    },
    checkoutPayment: { error: null, isSubmitting: false, startPayment: vi.fn() },
    queryClient: { invalidateQueries: vi.fn(async () => undefined) },
    refresh: vi.fn(),
    refreshAfterBagChange: vi.fn(async () => undefined),
    releasingIds: new Set<string>(),
    removeFromBag: vi.fn(),
    router: { push: vi.fn(), refresh: vi.fn() },
    runners: new Map<string, (intent: unknown) => Promise<void> | void>(),
    serverCart: {
      items: [] as unknown[],
      userId: "user-1" as null | string,
    },
    session: {
      data: { user: { id: "user-1" } },
      status: "authenticated",
    },
    toast,
    useCollectionStock: vi.fn(),
    verdicts: new Map<string, { reservedUntil: null | string; state: string }>(),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: ReactNode;
    className?: string;
    href: string;
    onClick?: () => void;
  }) => (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

vi.mock("@/lib/analytics/client", () => ({
  trackOncePerSession: vi.fn(),
  trackWebsiteMetric: vi.fn(),
}));

vi.mock("@/lib/realtime/use-collection-stock", () => ({
  useCollectionStock: mocks.useCollectionStock,
}));

vi.mock("@/lib/commerce/use-server-cart", () => ({
  useServerCart: () => ({
    addToBag: vi.fn(),
    isAuthenticated: true,
    isError: false,
    isReleasing: (productId: string) => mocks.releasingIds.has(productId),
    presentationHasHydrated: true,
    presentedItems: mocks.serverCart.items,
    refresh: mocks.refresh,
    refreshAfterBagChange: mocks.refreshAfterBagChange,
    removeFromBag: mocks.removeFromBag,
    userId: mocks.serverCart.userId,
  }),
}));

vi.mock("next-auth/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth/react")>()),
  useSession: () => mocks.session,
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => mocks.router,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => mocks.addressesQuery,
  useQueryClient: () => mocks.queryClient,
}));

vi.mock("@/lib/analytics/track", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/track")>()),
  trackStartFlow: vi.fn(),
}));

vi.mock("@/lib/checkout/use-checkout-payment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/checkout/use-checkout-payment")>()),
  useCheckoutPayment: () => mocks.checkoutPayment,
}));

// The checkout's shipping form is not under test here; its preflight is.
vi.mock("@/components/checkout/checkout-address-form", () => ({
  CheckoutAddressForm: () => null,
}));
vi.mock("@/components/checkout/checkout-progress", () => ({
  CheckoutProgress: () => null,
}));
vi.mock("@/components/checkout/saved-address-picker", () => ({
  SavedAddressPicker: () => null,
}));

vi.mock("@/components/commerce/commerce-auth-provider", () => ({
  useCommerceIntentRunner: (
    type: string,
    runner: (intent: unknown) => Promise<void> | void,
  ) => {
    mocks.runners.set(type, runner);
  },
}));

vi.mock("@/lib/wishlist/use-wishlist", () => ({
  useWishlistActions: () => ({ save: vi.fn() }),
}));

import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartItem } from "@/components/cart/cart-item";
import { CartPageClient } from "@/components/cart/cart-page-client";
import { OrderSummary } from "@/components/checkout/order-summary";
import { CommerceIntentRunners } from "@/components/commerce/commerce-intent-runners";
import {
  announceViewerState,
  subscribeToViewerState,
} from "@/lib/commerce/viewer-state-bus";
import { useCartStore, type CartItem as CartLine } from "@/lib/store/cart-store";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const HOLD_UNTIL = "2099-01-01T10:30:00.000Z";

const line = (overrides: Partial<CartLine> & Record<string, unknown> = {}) =>
  ({
    addedAt: "2026-09-11T10:00:00.000Z",
    id: PRODUCT_ID,
    image: "",
    name: "Kanchi Silk",
    price: 15_000,
    quantity: 1,
    reservedUntil: HOLD_UNTIL,
    slug: "kanchi-silk",
    status: "active",
    ...overrides,
  }) as CartLine;

let container: HTMLDivElement;
let root: Root;

const render = async (element: ReactNode) => {
  await act(async () => {
    root.render(element);
  });
};

const setVerdict = (state: Verdict) => {
  mocks.verdicts.set(PRODUCT_ID, { reservedUntil: HOLD_UNTIL, state });
};

const text = () => document.body.textContent ?? "";
const removeControls = () =>
  Array.from(document.body.querySelectorAll("button")).filter((button) =>
    /^Remove /.test(button.getAttribute("aria-label") ?? ""),
  );

const emptyDiscount = {
  applied: null,
  code: "",
  error: null,
  isValidating: false,
  onApply: () => undefined,
  onCodeChange: () => undefined,
  onRemove: () => undefined,
};

const renderSummary = (
  props: { isReleasing?: (id: string) => boolean; items?: CartLine[] } = {},
) =>
  render(
    <OrderSummary
      discount={emptyDiscount}
      items={[line()]}
      onRemoveItem={() => undefined}
      shippingCost={0}
      shippingMethod="standard"
      subtotal={15_000}
      taxAmount={0}
      taxRateLabel="0%"
      total={15_000}
      {...props}
    />,
  );

const openDrawer = async () => {
  await render(<CartDrawer />);
  const trigger = container.querySelector<HTMLButtonElement>(
    "button[data-ftt-cart-target]",
  );
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.click();
  });
};

const checkoutControl = (label: RegExp) =>
  Array.from(document.body.querySelectorAll("a, button")).find((element) =>
    label.test(element.textContent ?? ""),
  );

beforeEach(() => {
  mocks.verdicts.clear();
  mocks.releasingIds.clear();
  mocks.runners.clear();
  mocks.serverCart.items = [line()];
  mocks.serverCart.userId = "user-1";
  mocks.removeFromBag.mockReset();
  mocks.removeFromBag.mockResolvedValue({ ok: true });
  mocks.refresh.mockReset();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.router.push.mockReset();
  mocks.router.refresh.mockReset();
  mocks.checkoutPayment.startPayment.mockReset();
  mocks.toast.mockReset();
  mocks.toast.error.mockReset();
  mocks.toast.success.mockReset();
  mocks.useCollectionStock.mockReset();
  mocks.useCollectionStock.mockImplementation(
    (productId: string, seed: { reservedUntil: null | string; state: string }) =>
      mocks.verdicts.get(productId) ?? seed,
  );
  useCartStore.setState({ presentationUserId: "user-1" });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  document.body.innerHTML = "";
});

describe("every bag surface reads the shared verdict, seeded from the line", () => {
  it.each([
    ["drawer", openDrawer],
    ["bag page", () => render(<CartItem item={line({ viewerState: "payment_pending" })} />)],
    ["checkout summary", () => renderSummary()],
  ])("%s asks the viewer-state hook for this product", async (_surface, mount) => {
    mocks.serverCart.items = [line({ viewerState: "payment_pending" })];
    await mount();

    expect(mocks.useCollectionStock).toHaveBeenCalledWith(PRODUCT_ID, {
      reservedUntil: HOLD_UNTIL,
      state: expect.stringMatching(/payment_pending|checking/),
    });
  });

  it("seeds an unverified line as checking, never as the shopper's hold", async () => {
    await render(<CartItem item={line({ viewerState: undefined })} />);

    expect(mocks.useCollectionStock).toHaveBeenCalledWith(PRODUCT_ID, {
      reservedUntil: HOLD_UNTIL,
      state: "checking",
    });
    expect(text()).toContain("Checking…");
    expect(text()).not.toContain("Reserved for you");
    expect(removeControls()).toHaveLength(0);
  });

  it("lets the live verdict overrule a stale row that still reads active", async () => {
    // The row says active and the GET said in_my_cart; the poll has since
    // learned a payment started in another tab.
    setVerdict("payment_pending");
    await render(<CartItem item={line({ status: "active", viewerState: "in_my_cart" })} />);

    expect(text()).toContain("In bag");
    expect(removeControls()).toHaveLength(0);
  });
});

describe("drawer", () => {
  it("in_my_cart: held for you, with the trash", async () => {
    setVerdict("in_my_cart");
    await openDrawer();

    expect(text()).toContain("Held for you until");
    expect(removeControls()).toHaveLength(1);
    expect(checkoutControl(/Proceed to checkout/)?.tagName).toBe("A");
  });

  it("payment_pending: In bag with no remove control", async () => {
    setVerdict("payment_pending");
    await openDrawer();

    expect(text()).toContain("In bag");
    expect(text()).not.toContain("Held for you until");
    expect(removeControls()).toHaveLength(0);
  });

  it("sold: Sold, no trash, and the disabled checkout control stays in place", async () => {
    setVerdict("sold");
    await openDrawer();

    expect(text()).toContain("Sold");
    expect(removeControls()).toHaveLength(0);
    const checkout = checkoutControl(/Proceed to checkout/);
    expect(checkout?.tagName).toBe("BUTTON");
    expect((checkout as HTMLButtonElement).disabled).toBe(true);
    expect(checkout?.className).toContain(
      "mt-4 h-12 w-full rounded-full bg-[#141D46] text-[#FDF7F1]",
    );
  });

  it("reserved_by_other: no ownership copy and no trash", async () => {
    setVerdict("reserved_by_other");
    await openDrawer();

    expect(text()).toContain("Reserved");
    expect(text()).not.toContain("Held for you until");
    expect(removeControls()).toHaveLength(0);
  });

  it("checking: no trash and checkout blocked", async () => {
    setVerdict("checking");
    await openDrawer();

    expect(removeControls()).toHaveLength(0);
    expect(
      (checkoutControl(/Proceed to checkout/) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("releasing: always shows Releasing…, even for a line with no hold time", async () => {
    setVerdict("in_my_cart");
    mocks.serverCart.items = [line({ reservedUntil: null })];
    mocks.releasingIds.add(PRODUCT_ID);
    await openDrawer();

    expect(text()).toContain("Releasing…");
  });

  it("stays quiet when the removal answer belongs to a signed-out account", async () => {
    setVerdict("in_my_cart");
    mocks.removeFromBag.mockResolvedValue({ code: "VIEWER_CHANGED", ok: false });
    await openDrawer();

    await act(async () => {
      removeControls()[0]!.click();
    });

    expect(mocks.removeFromBag).toHaveBeenCalledWith(PRODUCT_ID);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});

describe("bag page line", () => {
  it("in_my_cart: Reserved for you, with the trash", async () => {
    setVerdict("in_my_cart");
    await render(<CartItem item={line()} />);

    expect(text()).toContain("Reserved for you");
    expect(removeControls()).toHaveLength(1);
  });

  it("payment_pending: In bag with no remove control", async () => {
    setVerdict("payment_pending");
    await render(<CartItem item={line()} />);

    expect(text()).toContain("In bag");
    expect(text()).not.toContain("Reserved for you");
    expect(removeControls()).toHaveLength(0);
  });

  it("sold: Sold with no remove control", async () => {
    setVerdict("sold");
    await render(<CartItem item={line()} />);

    expect(text()).toContain("Sold");
    expect(removeControls()).toHaveLength(0);
  });

  it("reserved_by_other: never claims the hold is theirs", async () => {
    setVerdict("reserved_by_other");
    await render(<CartItem item={line()} />);

    expect(text()).not.toContain("Reserved for you");
    expect(text()).not.toContain("Held until");
    expect(removeControls()).toHaveLength(0);
  });

  it("releasing: Releasing…", async () => {
    setVerdict("in_my_cart");
    mocks.releasingIds.add(PRODUCT_ID);
    await render(<CartItem item={line()} />);

    expect(text()).toContain("Releasing…");
  });

  it("stays quiet when the removal answer belongs to a signed-out account", async () => {
    setVerdict("in_my_cart");
    mocks.removeFromBag.mockResolvedValue({ code: "VIEWER_CHANGED", ok: false });
    await render(<CartItem item={line()} />);

    await act(async () => {
      removeControls()[0]!.click();
    });

    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ["sold", false],
    ["checking", false],
    ["in_my_cart", true],
  ] satisfies Array<[Verdict, boolean]>)(
    "page checkout follows the line verdict: %s",
    async (state, enabled) => {
      setVerdict(state);
      await render(<CartPageClient featuredPicks={[]} showHero={false} />);

      const checkout = checkoutControl(/Proceed to Checkout/);
      expect(checkout?.tagName).toBe(enabled ? "A" : "BUTTON");
    },
  );
});

describe("checkout summary line", () => {
  it("in_my_cart: quantity and the remove control", async () => {
    setVerdict("in_my_cart");
    await renderSummary();

    expect(text()).toContain("Qty 1");
    expect(removeControls()).toHaveLength(1);
  });

  it("payment_pending: In bag with no remove control", async () => {
    setVerdict("payment_pending");
    await renderSummary();

    expect(text()).toContain("In bag");
    expect(removeControls()).toHaveLength(0);
  });

  it("sold: Sold with no remove control", async () => {
    setVerdict("sold");
    await renderSummary();

    expect(text()).toContain("Sold");
    expect(removeControls()).toHaveLength(0);
  });

  it.each(["reserved_by_other", "checking"] satisfies Verdict[])(
    "%s: no remove control",
    async (state) => {
      setVerdict(state);
      await renderSummary();

      expect(removeControls()).toHaveLength(0);
    },
  );

  it("releasing: Releasing…, with the remove control disabled", async () => {
    setVerdict("in_my_cart");
    await renderSummary({ isReleasing: (id) => id === PRODUCT_ID });

    expect(text()).toContain("Releasing…");
    expect(removeControls()[0]?.disabled).toBe(true);
  });

  it("reports the verdict it draws so payment can be gated on it", async () => {
    setVerdict("sold");
    const onViewerState = vi.fn();
    await render(
      <OrderSummary
        discount={emptyDiscount}
        items={[line()]}
        onRemoveItem={() => undefined}
        onViewerState={onViewerState}
        shippingCost={0}
        shippingMethod="standard"
        subtotal={15_000}
        taxAmount={0}
        taxRateLabel="0%"
        total={15_000}
      />,
    );

    expect(onViewerState).toHaveBeenCalledWith(PRODUCT_ID, "sold");
  });
});

describe("a row already in payment keeps its line between polls", () => {
  // Another tab has just started paying: the row reads payment_pending, but
  // the last poll left before that and still says in_my_cart.
  const inPayment = () => line({ status: "payment_pending" });

  it.each([
    ["drawer", openDrawer],
    ["bag page", () => render(<CartItem item={inPayment()} />)],
    ["checkout summary", () => renderSummary({ items: [inPayment()] })],
  ])("%s shows no remove control", async (_surface, mount) => {
    setVerdict("in_my_cart");
    mocks.serverCart.items = [inPayment()];
    await mount();

    expect(removeControls()).toHaveLength(0);
  });

  it.each([
    ["drawer", openDrawer],
    ["bag page", () => render(<CartItem item={line()} />)],
    ["checkout summary", () => renderSummary()],
  ])("%s still offers it for an active row the verdict holds", async (_surface, mount) => {
    setVerdict("in_my_cart");
    await mount();

    expect(removeControls()).toHaveLength(1);
  });
});

describe("checkout's availability preflight", () => {
  const SECOND_ID = "22222222-2222-4222-8222-222222222222";
  const THIRD_ID = "33333333-3333-4333-8333-333333333333";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells every surface each verdict it parses, so a card reads it without its own poll", async () => {
    const liveStock = await vi.importActual<
      typeof import("@/lib/realtime/use-collection-stock")
    >("@/lib/realtime/use-collection-stock");
    const { CheckoutPageClient } = await import(
      "@/components/checkout/checkout-page-client"
    );

    const preflights: string[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== "/api/v2/products/viewer-state") {
          return { json: async () => null, ok: false, status: 404 };
        }
        // The grid's own poll carries an abort signal and is never answered,
        // so a card can only learn these verdicts from the checkout.
        if (init?.signal) return new Promise(() => {});
        preflights.push(
          (JSON.parse(String(init?.body)) as { productIds: string[] }).productIds,
        );
        return {
          json: async () => ({
            products: {
              [PRODUCT_ID]: { reservedUntil: null, state: "sold" },
              [SECOND_ID]: { reservedUntil: HOLD_UNTIL, state: "in_my_cart" },
              [THIRD_ID]: { reservedUntil: null, state: "AVAILABLE" },
            },
          }),
          ok: true,
          status: 200,
        };
      }),
    );
    mocks.serverCart.items = [
      line(),
      line({ id: SECOND_ID, name: "Banarasi Silk", slug: "banarasi-silk" }),
      line({ id: THIRD_ID, name: "Chanderi Cotton", slug: "chanderi-cotton" }),
    ];

    function Card({ productId }: { productId: string }) {
      const entry = liveStock.useCollectionStock(productId, {
        reservedUntil: null,
        state: "available",
      });
      return (
        <output data-card={productId}>
          {`${entry.state} ${entry.reservedUntil ?? "none"}`}
        </output>
      );
    }
    const card = (productId: string) =>
      container.querySelector(`[data-card="${productId}"]`)?.textContent;

    await render(
      <liveStock.CollectionStockProvider>
        {[PRODUCT_ID, SECOND_ID, THIRD_ID].map((productId) => (
          <Card key={productId} productId={productId} />
        ))}
        <CheckoutPageClient featuredPicks={[]} />
      </liveStock.CollectionStockProvider>,
    );
    // A signed-in shopper's card waits rather than trusting the page seed.
    expect(card(PRODUCT_ID)).toBe("checking none");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(preflights).toEqual([[PRODUCT_ID, SECOND_ID, THIRD_ID]]);
    expect(card(PRODUCT_ID)).toBe("sold none");
    // The sold line stops the preflight, and the line after it is still told.
    expect(card(SECOND_ID)).toBe(`in_my_cart ${HOLD_UNTIL}`);
    // A malformed entry is not a verdict, so nothing is announced for it.
    expect(card(THIRD_ID)).toBe("checking none");
  });

  it("never lets a preflight that left before a removal put its older verdict back", async () => {
    const liveStock = await vi.importActual<
      typeof import("@/lib/realtime/use-collection-stock")
    >("@/lib/realtime/use-collection-stock");
    const { CheckoutPageClient } = await import(
      "@/components/checkout/checkout-page-client"
    );

    const preflights: Array<(state: string) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== "/api/v2/products/viewer-state") {
          return { json: async () => null, ok: false, status: 404 };
        }
        // The grid's own poll is never answered, as above.
        if (init?.signal) return new Promise(() => {});
        return new Promise((resolve) => {
          preflights.push((state) =>
            resolve({
              json: async () => ({
                products: { [PRODUCT_ID]: { reservedUntil: HOLD_UNTIL, state } },
              }),
              ok: true,
              status: 200,
            }),
          );
        });
      }),
    );

    function Card() {
      const entry = liveStock.useCollectionStock(PRODUCT_ID, {
        reservedUntil: null,
        state: "available",
      });
      return (
        <output data-card={PRODUCT_ID}>
          {`${entry.state} ${entry.reservedUntil ?? "none"}`}
        </output>
      );
    }
    const card = () =>
      container.querySelector(`[data-card="${PRODUCT_ID}"]`)?.textContent;
    const page = () => (
      <liveStock.CollectionStockProvider>
        <Card />
        <CheckoutPageClient featuredPicks={[]} />
      </liveStock.CollectionStockProvider>
    );
    const settle = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

    await render(page());
    await settle();
    expect(preflights).toHaveLength(1);

    // The shopper takes the saree out while that preflight is still out.
    await act(async () => {
      announceViewerState({
        productId: PRODUCT_ID,
        reservedUntil: null,
        state: "available",
        viewerKey: "user:user-1",
      });
    });
    expect(card()).toBe("available none");

    // It lands with the hold as it stood when it left.
    preflights[0]("in_my_cart");
    await settle();
    expect(card()).toBe("available none");

    // A preflight that leaves after the removal is news again.
    mocks.serverCart.items = [line()];
    await render(page());
    await settle();
    expect(preflights).toHaveLength(2);
    preflights[1]("reserved_by_other");
    await settle();
    expect(card()).toBe(`reserved_by_other ${HOLD_UNTIL}`);
  });
});

describe("no bag surface offers to complete a payment", () => {
  it.each([
    "in_my_cart",
    "payment_pending",
    "sold",
    "reserved_by_other",
    "checking",
  ] satisfies Verdict[])("%s", async (state) => {
    setVerdict(state);
    await openDrawer();
    expect(text()).not.toMatch(/complete payment/i);
    await render(
      <>
        <CartItem item={line()} />
        <OrderSummary
          discount={emptyDiscount}
          items={[line()]}
          onRemoveItem={() => undefined}
          shippingCost={0}
          shippingMethod="standard"
          subtotal={15_000}
          taxAmount={0}
          taxRateLabel="0%"
          total={15_000}
        />
      </>,
    );
    expect(text()).not.toMatch(/complete payment/i);
  });
});

describe("checkout conflicts", () => {
  it("never removes the line for a payment already in progress", async () => {
    const { applyCheckoutConflict } = await import(
      "@/components/checkout/checkout-page-client"
    );
    const { getOneOfOneConflictCopy } = await import(
      "@/lib/checkout/one-of-one-conflict-copy"
    );
    const copy = getOneOfOneConflictCopy("PAYMENT_IN_PROGRESS");
    const actions = {
      refresh: vi.fn(async () => undefined),
      removeFromBag: vi.fn(async () => undefined),
      showConflict: vi.fn(),
    };

    expect(copy.code).toBe("PAYMENT_IN_PROGRESS");
    expect(copy.removeProduct).toBe(false);
    await applyCheckoutConflict({ copy, productId: PRODUCT_ID }, actions);

    expect(actions.showConflict).toHaveBeenCalledWith(copy);
    expect(actions.removeFromBag).not.toHaveBeenCalled();
    // The bag is re-read so the line redraws as In bag with no remove.
    expect(actions.refresh).toHaveBeenCalledOnce();
  });

  it("removes a line whose copy says the piece is gone", async () => {
    const { applyCheckoutConflict } = await import(
      "@/components/checkout/checkout-page-client"
    );
    const { getOneOfOneConflictCopy } = await import(
      "@/lib/checkout/one-of-one-conflict-copy"
    );
    const actions = {
      refresh: vi.fn(async () => undefined),
      removeFromBag: vi.fn(async () => undefined),
      showConflict: vi.fn(),
    };

    await applyCheckoutConflict(
      { copy: getOneOfOneConflictCopy("PRODUCT_SOLD"), productId: PRODUCT_ID },
      actions,
    );

    expect(actions.removeFromBag).toHaveBeenCalledWith(PRODUCT_ID);
  });
});

describe("notify replay after sign-in", () => {
  const announcements: unknown[] = [];
  let stopListening: () => void = () => undefined;

  const replayNotify = async (status: number, body: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => body,
        ok: status >= 200 && status < 300,
        status,
      })),
    );
    await render(<CommerceIntentRunners />);
    const runner = mocks.runners.get("notify-me");
    expect(runner).toBeDefined();
    await act(async () => {
      await runner!({
        id: "intent-1",
        productId: PRODUCT_ID,
        source: "product-card",
        type: "notify-me",
      });
    });
  };

  beforeEach(() => {
    announcements.length = 0;
    stopListening = subscribeToViewerState((announcement) => {
      announcements.push(announcement);
    });
  });

  afterEach(() => {
    stopListening();
    vi.unstubAllGlobals();
  });

  it.each([
    ["PRODUCT_SOLD", "sold", "error", /found its next home/],
    ["PRODUCT_AVAILABLE", "available", "success", /available now/],
    ["NOTIFY_NOT_ELIGIBLE", "reserved_by_other", "error", /isn't available/],
  ] as const)(
    "%s applies the verdict and says why",
    async (code, viewerState, channel, copy) => {
      await replayNotify(409, { code, message: "server words", viewerState });

      expect(announcements).toEqual([
        {
          productId: PRODUCT_ID,
          reservedUntil: null,
          state: viewerState,
          viewerKey: "user:user-1",
        },
      ]);
      expect(mocks.toast[channel]).toHaveBeenCalledWith(
        expect.stringMatching(copy),
        ...(channel === "success" ? [expect.anything()] : []),
      );
      expect(mocks.toast.error).not.toHaveBeenCalledWith(
        "Unable to register. Please try again.",
      );
    },
  );

  it.each([
    ["in_my_cart", /already in your bag/],
    ["payment_pending", /payment in progress/],
  ] as const)("NOTIFY_OWN_HOLD for %s names the shopper's own hold", async (viewerState, copy) => {
    await replayNotify(409, { code: "NOTIFY_OWN_HOLD", viewerState });

    expect(announcements).toHaveLength(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringMatching(copy));
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("never applies a malformed verdict", async () => {
    await replayNotify(409, { code: "PRODUCT_SOLD", viewerState: "free-for-all" });

    expect(announcements).toHaveLength(0);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/found its next home/),
    );
  });

  it("keeps the generic retry copy for failures that are not refusals", async () => {
    await replayNotify(500, null);

    expect(announcements).toHaveLength(0);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Unable to register. Please try again.",
    );
  });
});
