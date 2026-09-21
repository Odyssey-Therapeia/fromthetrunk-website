/**
 * Every commerce surface renders the one verdict it is handed.
 *
 * Source text can only show that a branch exists. These render the real
 * product card, the PDP action, its Drape Room tile, the blouse controls and
 * the PDP notice for each verdict, and read what a shopper would see: the
 * label, whether Add is live, whether a trash exists, and whether Drape Room
 * or a new save is on offer.
 */
// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // The cart store binds its persist storage at import time, before any test.
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

  return {
    releasing: new Set<string>(),
    serverCart: {} as Record<string, unknown>,
    toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
    verdicts: new Map<string, { reservedUntil: null | string; state: string }>(),
    wishlist: { isSaved: false, toggle: vi.fn() },
  };
});

vi.mock("@/lib/commerce/use-server-cart", () => ({
  useServerCart: () => mocks.serverCart,
}));

vi.mock("@/lib/realtime/use-collection-stock", () => ({
  // The provider's own contract: the caller's seed until a verdict exists.
  useCollectionStock: (
    productId: string,
    initial: { reservedUntil: null | string; state: string },
  ) => mocks.verdicts.get(productId) ?? initial,
}));

vi.mock("@/components/commerce/commerce-auth-provider", () => ({
  useCommerceAuth: () => null,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1" } },
    status: "authenticated",
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/wishlist/use-wishlist", () => ({
  useWishlistActions: () => ({
    isPending: false,
    save: vi.fn(),
    toggle: mocks.wishlist.toggle,
  }),
  useWishlistMembership: () => ({
    isReady: true,
    isSaved: mocks.wishlist.isSaved,
  }),
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { children?: ReactNode; href: string } & Record<string, unknown>) => {
      const anchorProps: Record<string, unknown> = { ...props };
      delete anchorProps.prefetch;
      return createElement("a", anchorProps, props.children);
    },
  };
});

vi.mock("@/lib/drape-room/product", () => ({
  // Real eligibility needs approved media; the rule under test is the verdict.
  projectDrapeRoomEntry: (product: {
    id: string;
    name: string;
    pricePaise: number;
    slug: string;
    stockStatus: string;
  }) => ({
    eligible: true,
    saree: {
      displayImageUrl: "/media/kanchi-silk.webp",
      fabric: "Silk",
      pricePaise: product.pricePaise,
      productId: product.id,
      productImageId: "media-1",
      productName: product.name,
      productReferenceVersion: "pdp:hash:v1",
      productSlug: product.slug,
      stockStatus: product.stockStatus,
    },
  }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/collection/kanchi-silk",
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/components/drape-room/drape-room-stage", async () => {
  const { createElement } = await import("react");
  const { DrapeRoomResultView } = await import(
    "@/components/drape-room/drape-room-result-view"
  );
  return {
    /*
     * The real stage shows the result view only once a saved preview loads
     * from this browser's storage. This stand-in shows it at once, with the
     * very slots and generation flag the room hands the stage.
     */
    DrapeRoomStage: (props: {
      addToCartControl?: ReactNode;
      generationAvailable: boolean;
      product: DrapeSaree;
      wishlistControl?: ReactNode;
    }) =>
      createElement(
        "div",
        { "data-generation-available": String(props.generationAvailable) },
        createElement(DrapeRoomResultView, {
          activeBackground: "studio",
          addToCartControl: props.addToCartControl,
          cachedBackgrounds: new Set(["studio"] as const),
          generationAvailable: props.generationAvailable,
          isCacheChecking: false,
          isGenerating: false,
          onBackgroundSelect: () => {},
          onSave: () => {},
          onVisit: () => {},
          product: props.product,
          result: {
            background: "studio",
            blob: new Blob(["cached"], { type: "image/jpeg" }),
            cacheKey: `tryon:${"b".repeat(64)}`,
            createdAt: 2,
            engineVersion: "engine-v1",
            model: "image-model-v1",
            outputVersion: "output-v1",
            previewUrl: "blob:cached-result",
            productId: props.product.productId,
            productReferenceVersion: props.product.productReferenceVersion,
            promptVersion: "prompt-v1",
            provider: "google",
            referenceContractVersion: "gallery-v2",
            userPhotoDigest: "a".repeat(64),
          },
          wishlistControl: props.wishlistControl,
        }),
      ),
  };
});

vi.mock("@/components/drape-room/launch/drape-launch-teaser", () => ({
  // Megabytes of animated media behind a dynamic import; the entry is the
  // subject here, not the teaser it opens.
  DrapeLaunchTeaser: () => null,
}));

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { DrapeRoomExperience } from "@/components/drape-room/drape-room-experience";
import { DrapeRoomTrigger } from "@/components/drape-room/drape-room-trigger";
import { DrapeLaunchProductEntry } from "@/components/drape-room/launch/drape-launch-product-entry";
import {
  BlousePurchaseControls,
  BlouseStickyAction,
} from "@/components/product/blouse-purchase-controls";
import {
  PdpAvailabilityNotice,
  PdpStockBadge,
} from "@/components/product/pdp-live-availability";
import { ProductCard } from "@/components/product/product-card";
import { WishlistButton } from "@/components/product/wishlist-button";
import { Badge } from "@/components/ui/badge";
import {
  VIEWER_STATE_EVENT,
  type ViewerStateAnnouncement,
} from "@/lib/commerce/viewer-state-bus";
import type { DrapeRoomClientTransport } from "@/lib/drape-room/client/api";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import type {
  DrapeRoomAvailability,
  PublicTryOnConfig,
} from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types/domain";

const USER_ID = "user-1";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const AVAILABLE_COPY =
  "Adding this piece reserves the unique piece in your bag. Final ownership is confirmed at checkout.";
const RESERVED_COPY = "This piece is currently reserved by another buyer.";
const SOLD_COPY = "This piece has found its next wardrobe.";

const saree = {
  attributes: null,
  detailsFabric: "Silk",
  id: PRODUCT_ID,
  images: [],
  metadata: null,
  name: "Kanchi Silk",
  originalPricePaise: null,
  pricePaise: 1_250_000,
  slug: "kanchi-silk",
  stockStatus: "available",
  storyTitle: "A story from the trunk",
  tags: [],
  typeSlug: "saree",
} as unknown as Product;

const blouse = {
  ...saree,
  name: "Temple Blouse",
  slug: "temple-blouse",
  typeSlug: "blouse",
} as unknown as Product;

function makeServerCart(overrides: Record<string, unknown> = {}) {
  return {
    // Never settles, so a click proves the command ran without unwinding motion.
    addToBag: vi.fn(() => new Promise(() => {})),
    isAuthenticated: true,
    isReleasing: (productId: string) => mocks.releasing.has(productId),
    items: [] as unknown[],
    refresh: vi.fn(async () => {}),
    removeFromBag: vi.fn(async () => ({ ok: true, viewerState: "available" })),
    userId: USER_ID,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

/** Lets a click's fetch, JSON and refresh chain settle. */
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const setVerdict = (state: string, reservedUntil: null | string = null) =>
  mocks.verdicts.set(PRODUCT_ID, { reservedUntil, state });

/** The instant a held saree's verdict says its hold runs until. */
const HOLD_UNTIL = "2026-09-11T11:00:00.000Z";

/** The saree as every Drape Room surface receives it. */
const drapeSaree: DrapeSaree = {
  displayImageUrl: "/media/kanchi-silk.webp",
  fabric: "Silk",
  pricePaise: 1_250_000,
  productId: PRODUCT_ID,
  productImageId: "media-1",
  productName: "Kanchi Silk",
  productReferenceVersion: "pdp:hash:v1",
  productSlug: "kanchi-silk",
  stockStatus: "available",
};

const textOf = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const buttons = () => Array.from(container.querySelectorAll("button"));
const button = (label: string) =>
  buttons().find((candidate) => textOf(candidate) === label);
const removeControls = () =>
  container.querySelectorAll<HTMLButtonElement>(
    '[aria-label^="Remove "][aria-label$=" from bag"]',
  );
const drapeTrigger = () =>
  container.querySelector<HTMLButtonElement>(
    '[aria-label^="Open Drape Room for"]',
  );
const heart = () =>
  container.querySelector<HTMLButtonElement>(
    '[aria-label$=" to wishlist"], [aria-label$=" from wishlist"]',
  );
const tile = () =>
  container.querySelector<HTMLButtonElement>("[data-drape-action-tile]");

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  // Reduced motion, so a started add never waits on animation frames.
  value: (query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    matches: true,
    media: query,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

beforeEach(() => {
  mocks.verdicts.clear();
  mocks.releasing.clear();
  mocks.serverCart = makeServerCart();
  mocks.wishlist.isSaved = false;
  mocks.wishlist.toggle.mockReset();
  mocks.toast.error.mockReset();
  mocks.toast.message.mockReset();
  mocks.toast.success.mockReset();
  useCartStore.setState({ presentationUserId: USER_ID });
  useDrapeRoomOperationalStore.getState().setUiAvailability(true);

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("product card", () => {
  it("available: + Cart is live, with Drape Room and a heart", async () => {
    setVerdict("available");
    await render(<ProductCard product={saree} />);

    expect(button("+ Cart")?.disabled).toBe(false);
    expect(removeControls()).toHaveLength(0);
    expect(drapeTrigger()?.disabled).toBe(false);
    expect(heart()).not.toBeNull();
  });

  it("in_my_cart: In bag, with a trash to take it back out", async () => {
    setVerdict("in_my_cart");
    await render(<ProductCard product={saree} />);

    expect(button("In bag")?.disabled).toBe(true);
    expect(button("+ Cart")).toBeUndefined();
    expect(removeControls()).toHaveLength(1);
    expect(removeControls()[0].disabled).toBe(false);
  });

  it("payment_pending: In bag and no trash", async () => {
    setVerdict("payment_pending");
    await render(<ProductCard product={saree} />);

    expect(button("In bag")?.disabled).toBe(true);
    expect(removeControls()).toHaveLength(0);
  });

  it("reserved_by_other: Notify me and no Add, whatever the bag row says", async () => {
    // A bag row proves a row exists, not the hold. The verdict is final.
    mocks.serverCart = makeServerCart({
      items: [
        {
          addedAt: "2026-09-11T10:00:00.000Z",
          productId: PRODUCT_ID,
          reservedUntil: null,
          selectedOptions: null,
          status: "active",
        },
      ],
    });
    setVerdict("reserved_by_other");
    await render(<ProductCard product={saree} />);

    expect(button("Notify me")?.disabled).toBe(false);
    expect(button("+ Cart")).toBeUndefined();
    expect(button("In bag")).toBeUndefined();
    expect(removeControls()).toHaveLength(0);
    expect(textOf(container)).toContain("Reserved");
    // Trying on a saree another shopper holds was always allowed.
    expect(drapeTrigger()?.disabled).toBe(false);
  });

  it("sold: Sold, with nothing to act on", async () => {
    setVerdict("sold");
    await render(<ProductCard product={saree} />);

    expect(button("Sold")?.disabled).toBe(true);
    expect(button("+ Cart")).toBeUndefined();
    expect(button("Notify me")).toBeUndefined();
    expect(drapeTrigger()).toBeNull();
    expect(heart()).toBeNull();
    expect(removeControls()).toHaveLength(0);
    expect(textOf(container)).toContain("Sold out");
    // No sold copy may suggest a notification is coming.
    expect(textOf(container).toLowerCase()).not.toContain("notify");
  });

  it("checking: Add stays disabled and Drape Room waits", async () => {
    setVerdict("checking");
    await render(<ProductCard product={saree} />);

    expect(button("Checking…")?.disabled).toBe(true);
    expect(button("+ Cart")).toBeUndefined();
    expect(drapeTrigger()?.disabled).toBe(true);
  });

  it("remove: Releasing… while it travels, then + Cart, and the re-add goes straight through", async () => {
    setVerdict("in_my_cart");
    let finishRemoval: (result: { ok: boolean; viewerState: string }) => void =
      () => {};
    const cart = makeServerCart({
      removeFromBag: vi.fn(() => {
        mocks.releasing.add(PRODUCT_ID);
        return new Promise((resolve) => {
          finishRemoval = resolve;
        });
      }),
    });
    mocks.serverCart = cart;
    await render(<ProductCard product={saree} />);

    await act(async () => {
      removeControls()[0].click();
    });
    await render(<ProductCard product={saree} />);
    expect(button("Releasing…")?.disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Releasing Kanchi Silk"]',
      )?.disabled,
    ).toBe(true);

    // The verdict can land before the release flag clears: still no offer.
    setVerdict("available");
    await render(<ProductCard product={saree} />);
    expect(button("Releasing…")?.disabled).toBe(true);
    expect(button("+ Cart")).toBeUndefined();

    mocks.releasing.delete(PRODUCT_ID);
    await act(async () => {
      finishRemoval({ ok: true, viewerState: "available" });
    });
    await render(<ProductCard product={saree} />);

    const add = button("+ Cart");
    expect(add?.disabled).toBe(false);
    expect(mocks.toast.error).not.toHaveBeenCalled();

    await act(async () => {
      add?.click();
    });
    expect(cart.addToBag).toHaveBeenCalledTimes(1);
    expect(cart.addToBag).toHaveBeenCalledWith({ productId: PRODUCT_ID });
  });

  it("stays quiet when a removal answered for an account that has since left", async () => {
    setVerdict("in_my_cart");
    const cart = makeServerCart({
      removeFromBag: vi.fn(async () => ({ code: "VIEWER_CHANGED", ok: false })),
    });
    mocks.serverCart = cart;
    await render(<ProductCard product={saree} />);

    await act(async () => {
      removeControls()[0].click();
    });
    await flush();

    expect(cart.removeFromBag).toHaveBeenCalledWith(PRODUCT_ID);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ["sold", "Sold"],
    ["reserved", "Notify me"],
  ])(
    "seeds the row from the card's %s stock status, never the publication status",
    async (stockStatus, label) => {
      // No verdict yet, so every hook stands on its seed.
      await render(
        <ProductCard
          product={
            { ...saree, status: "published", stockStatus } as unknown as Product
          }
        />,
      );

      expect(button(label)).toBeDefined();
      expect(button("+ Cart")).toBeUndefined();
    },
  );

  it("turns a refused add into Notify me, never Try again or + Cart", async () => {
    setVerdict("available");
    const cart = makeServerCart({
      addToBag: vi.fn(async () => {
        // The hook announces the refusal's verdict before it answers.
        setVerdict("reserved_by_other", HOLD_UNTIL);
        return {
          code: "PRODUCT_RESERVED",
          ok: false,
          viewerState: "reserved_by_other",
        };
      }),
    });
    mocks.serverCart = cart;
    await render(<ProductCard product={saree} />);

    await act(async () => {
      button("+ Cart")?.click();
    });
    await flush();

    expect(cart.addToBag).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Just reserved by another buyer",
      expect.anything(),
    );
    expect(button("Notify me")?.disabled).toBe(false);
    expect(button("Try again")).toBeUndefined();
    expect(button("+ Cart")).toBeUndefined();

    // Freed again inside the refusal's two seconds: its tail stays gone.
    await flush();
    setVerdict("available");
    await render(<ProductCard product={saree} />);
    expect(button("+ Cart")?.disabled).toBe(false);
    expect(button("Try again")).toBeUndefined();
  });

  it("keeps Notify me's own words while an add is still travelling", async () => {
    setVerdict("available");
    // addToBag never settles, as in a sign-in replay still on the wire.
    const cart = makeServerCart();
    mocks.serverCart = cart;
    await render(<ProductCard product={saree} />);

    await act(async () => {
      button("+ Cart")?.click();
    });
    setVerdict("reserved_by_other", HOLD_UNTIL);
    await render(<ProductCard product={saree} />);

    expect(cart.addToBag).toHaveBeenCalledTimes(1);
    expect(button("Notify me")).toBeDefined();
    expect(button("+ Cart")).toBeUndefined();
  });

  describe("after a change", () => {
    let cartUpdates = 0;
    const countCartUpdate = () => {
      cartUpdates += 1;
    };

    beforeEach(() => {
      cartUpdates = 0;
      window.addEventListener("ftt:cart-updated", countCartUpdate);
    });

    afterEach(() => {
      window.removeEventListener("ftt:cart-updated", countCartUpdate);
    });

    it("leaves the grid's re-ask to the bag's own add, with no second event", async () => {
      setVerdict("available");
      const cart = makeServerCart({
        addToBag: vi.fn(async () => {
          setVerdict("in_my_cart", HOLD_UNTIL);
          return { ok: true, viewerState: "in_my_cart" };
        }),
      });
      mocks.serverCart = cart;
      await render(<ProductCard product={saree} />);

      await act(async () => {
        button("+ Cart")?.click();
      });
      await flush();
      await flush();
      await flush();

      // The toast fires beside the old event, so the flow got that far.
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Kanchi Silk added to your bag",
        expect.anything(),
      );
      expect(cartUpdates).toBe(0);
    });

    it("leaves it to the bag's own removal too", async () => {
      setVerdict("in_my_cart", HOLD_UNTIL);
      const cart = makeServerCart();
      mocks.serverCart = cart;
      await render(<ProductCard product={saree} />);

      await act(async () => {
        removeControls()[0].click();
      });
      await flush();

      expect(cart.removeFromBag).toHaveBeenCalledWith(PRODUCT_ID);
      expect(mocks.toast.error).not.toHaveBeenCalled();
      expect(cartUpdates).toBe(0);
    });
  });

  describe("row sizing", () => {
    // HEAD's own class strings for the idle row, class for class.
    const HEAD_PILL_CLASSES =
      "inline-flex max-w-full items-center rounded-full border border-[#B39152]/35 bg-[#B39152]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#601D1C] shadow-[0_8px_18px_rgba(179,145,82,0.14)] @sm:text-xs";
    const HEAD_BUTTON_CLASSES =
      "ftt-cart-motion-button inline-flex h-9 min-w-26 max-w-full items-center justify-center rounded-full px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] @sm:min-w-29 @sm:text-sm";
    const IDLE_COLOURS =
      "bg-[#141D46] text-[#FDF7F1] shadow-[0_8px_20px_rgba(20,29,70,0.16)] hover:bg-[#0E0D0E]";
    const UNAVAILABLE_COLOURS =
      "cursor-not-allowed bg-[#601D1C] text-[#FDF7F1] opacity-90";
    /** A card narrower than 12.5rem, and nowhere else. */
    const NARROW = "@max-[12.5rem]:";

    const classesOf = (element: Element | null | undefined) =>
      Array.from(element?.classList ?? []);
    /** Every class a card 12.5rem or wider actually applies. */
    const wideClasses = (element: Element | null | undefined) =>
      classesOf(element).filter((name) => !name.startsWith(NARROW));
    const narrowClasses = (element: Element | null | undefined) =>
      classesOf(element).filter((name) => name.startsWith(NARROW));
    const pill = () =>
      Array.from(container.querySelectorAll("span")).find(
        (span) =>
          span.classList.contains("rounded-full") &&
          span.classList.contains("bg-[#B39152]/12"),
      );
    /** What the pill reads where nothing below 12.5rem applies. */
    const wideWording = () => {
      const copy = pill()?.cloneNode(true) as HTMLElement | undefined;
      copy?.querySelectorAll(".hidden").forEach((hidden) => hidden.remove());
      return textOf(copy);
    };
    const motionButton = () =>
      container.querySelector("button.ftt-cart-motion-button");

    it.each([
      ["available", "+ Cart", IDLE_COLOURS],
      ["checking", "Checking…", UNAVAILABLE_COLOURS],
    ])(
      "%s: a wide card renders the original pill and button, class for class",
      async (state, label, colours) => {
        setVerdict(state);
        await render(<ProductCard product={saree} />);

        expect(wideClasses(pill()).join(" ")).toBe(HEAD_PILL_CLASSES);
        expect(wideWording()).toBe("New arrival");
        expect(textOf(motionButton())).toBe(label);
        expect(wideClasses(motionButton()).sort()).toEqual(
          `${HEAD_BUTTON_CLASSES} ${colours}`.split(" ").sort(),
        );
        expect(motionButton()?.classList.contains("min-w-22")).toBe(false);
      },
    );

    it.each(["available", "checking", "sold"])(
      "%s: gives ground only below 12.5rem, and never drops the pill",
      async (state) => {
        setVerdict(state);
        await render(<ProductCard product={saree} />);

        expect(narrowClasses(pill())).toEqual(
          expect.arrayContaining([`${NARROW}inline-block`, `${NARROW}truncate`]),
        );
        expect(narrowClasses(pill())).not.toContain(`${NARROW}hidden`);
        const [wideWords, narrowWords] = Array.from(pill()?.children ?? []);
        expect(textOf(wideWords)).toBe("New arrival");
        expect(classesOf(wideWords)).toEqual([`${NARROW}hidden`]);
        expect(textOf(narrowWords)).toBe("New");
        expect(classesOf(narrowWords)).toEqual(["hidden", `${NARROW}inline`]);
        expect(narrowClasses(motionButton())).toEqual([`${NARROW}min-w-22`]);
      },
    );

    it("keeps Select size and Sold at their original sizing", async () => {
      setVerdict("sold");
      await render(<ProductCard product={saree} />);
      expect(button("Sold")?.classList.contains("min-w-26")).toBe(true);
      expect(button("Sold")?.classList.contains("min-w-22")).toBe(false);
      expect(button("Sold")?.classList.contains("cursor-not-allowed")).toBe(true);

      setVerdict("available");
      await render(<ProductCard product={blouse} />);
      const selectSize = Array.from(container.querySelectorAll("a")).find(
        (link) => textOf(link) === "Select size",
      );
      expect(selectSize?.classList.contains("min-w-26")).toBe(true);
      expect(selectSize?.classList.contains("min-w-22")).toBe(false);
    });

    it("compacts only a row carrying a wider cluster", async () => {
      setVerdict("in_my_cart");
      await render(<ProductCard product={saree} />);

      expect(button("In bag")?.classList.contains("min-w-22")).toBe(true);
    });
  });
});

describe("product page action", () => {
  it("available: Add to Bag is live", async () => {
    setVerdict("available");
    await render(<AddToCartButton product={saree} />);

    expect(button("Add to Bag")?.disabled).toBe(false);
    expect(removeControls()).toHaveLength(0);
  });

  it("in_my_cart: In bag with a trash, in the original colours", async () => {
    setVerdict("in_my_cart");
    await render(<AddToCartButton product={saree} />);

    const inBag = button("In bag");
    expect(inBag?.disabled).toBe(true);
    expect(inBag?.classList.contains("text-[#FDF7F1]")).toBe(false);
    expect(removeControls()).toHaveLength(1);
    expect(removeControls()[0].disabled).toBe(false);
  });

  it("payment_pending: In bag and no trash", async () => {
    setVerdict("payment_pending");
    await render(<AddToCartButton product={saree} />);

    expect(button("In bag")?.disabled).toBe(true);
    expect(removeControls()).toHaveLength(0);
  });

  it("reserved_by_other: Notify me, legible on hover, and no Add", async () => {
    setVerdict("reserved_by_other");
    await render(<AddToCartButton product={saree} />);

    const notify = button("Notify me");
    expect(notify?.disabled).toBe(false);
    expect(notify?.classList.contains("hover:bg-[#601D1C]")).toBe(true);
    expect(notify?.classList.contains("hover:bg-accent")).toBe(false);
    expect(button("Add to Bag")).toBeUndefined();
  });

  it("sold: one disabled full-size Sold button and nothing else", async () => {
    setVerdict("sold");
    await render(<AddToCartButton product={saree} />);

    expect(buttons()).toHaveLength(1);
    const sold = button("Sold");
    expect(sold?.disabled).toBe(true);
    expect(sold?.classList.contains("py-6")).toBe(true);
    expect(sold?.classList.contains("w-full")).toBe(true);
  });

  it("checking: Checking… with Add disabled", async () => {
    setVerdict("checking");
    await render(<AddToCartButton product={saree} />);

    expect(button("Checking…")?.disabled).toBe(true);
    expect(button("Add to Bag")).toBeUndefined();
  });

  it.each(["in_my_cart", "available", "checking", "reserved_by_other"])(
    "releasing: Releasing… and disabled while the verdict says %s",
    async (state) => {
      setVerdict(state);
      mocks.releasing.add(PRODUCT_ID);
      await render(<AddToCartButton product={saree} />);

      expect(button("Releasing…")?.disabled).toBe(true);
      expect(button("Add to Bag")).toBeUndefined();
      // Nothing is offered mid-release, however the verdict reads.
      expect(button("Notify me")).toBeUndefined();
      expect(button("Checking…")).toBeUndefined();
    },
  );

  it("draws a release that outranks checking or a hold exactly as Checking… is drawn", async () => {
    setVerdict("checking");
    await render(<AddToCartButton product={saree} />);
    const checkingClass = button("Checking…")?.className;
    expect(checkingClass).toBeTruthy();

    mocks.releasing.add(PRODUCT_ID);
    for (const state of ["checking", "reserved_by_other"]) {
      setVerdict(state);
      await render(<AddToCartButton product={saree} />);
      expect(button("Releasing…")?.className).toBe(checkingClass);
    }
  });
});

describe("Drape Room tile", () => {
  const renderTile = () =>
    render(
      <AddToCartButton
        product={saree}
        presentation="drape-room"
        analyticsSource="drape-room"
      />,
    );

  it("available: Add to bag is live", async () => {
    setVerdict("available");
    await renderTile();

    expect(textOf(tile())).toBe("Add to bag");
    expect(tile()?.disabled).toBe(false);
  });

  it("in_my_cart: In bag with the remove action, without a highlight", async () => {
    setVerdict("in_my_cart");
    await renderTile();

    expect(tile()?.textContent).toContain("In bag");
    expect(tile()?.textContent).toContain("In your bag");
    expect(tile()?.getAttribute("aria-label")).toBe("Remove Kanchi Silk from bag");
    expect(tile()?.disabled).toBe(false);
    expect(tile()?.classList.contains("border-ftt-gold")).toBe(false);
  });

  it("payment_pending: In bag, inert, with no removal", async () => {
    setVerdict("payment_pending");
    await renderTile();

    expect(tile()?.textContent).toContain("In bag");
    expect(tile()?.disabled).toBe(true);
    expect(removeControls()).toHaveLength(0);
  });

  it("reserved_by_other: Notify me is live", async () => {
    setVerdict("reserved_by_other");
    await renderTile();

    expect(tile()?.textContent).toContain("Notify me");
    expect(tile()?.disabled).toBe(false);
  });

  it("sold: no tile at all", async () => {
    setVerdict("sold");
    await renderTile();

    expect(tile()).toBeNull();
  });

  it("checking: Checking…, disabled", async () => {
    setVerdict("checking");
    await renderTile();

    expect(tile()?.textContent).toContain("Checking…");
    expect(tile()?.disabled).toBe(true);
  });

  it("releasing: Releasing…, disabled, even once the verdict says available", async () => {
    setVerdict("available");
    mocks.releasing.add(PRODUCT_ID);
    await renderTile();

    expect(tile()?.textContent).toContain("Releasing…");
    expect(tile()?.disabled).toBe(true);
  });
});

describe("no surface offers to complete a payment", () => {
  it.each([
    "available",
    "in_my_cart",
    "payment_pending",
    "reserved_by_other",
    "sold",
    "checking",
  ])("%s", async (state) => {
    setVerdict(state);
    await render(
      <>
        <ProductCard product={saree} />
        <AddToCartButton product={saree} />
        <AddToCartButton
          product={saree}
          presentation="drape-room"
          analyticsSource="drape-room"
        />
      </>,
    );

    expect(textOf(container)).not.toMatch(/complete payment/i);
  });
});

describe("wishlist heart", () => {
  it("still removes an existing save while availability is checking", async () => {
    setVerdict("checking");
    mocks.wishlist.isSaved = true;
    await render(
      <WishlistButton productId={PRODUCT_ID} productName="Kanchi Silk" />,
    );

    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Kanchi Silk from wishlist"]',
    );
    expect(remove?.disabled).toBe(false);
    await act(async () => {
      remove?.click();
    });
    expect(mocks.wishlist.toggle).toHaveBeenCalledWith(PRODUCT_ID, true);
  });

  it("refuses a new save while availability is checking", async () => {
    setVerdict("checking");
    await render(
      <WishlistButton productId={PRODUCT_ID} productName="Kanchi Silk" />,
    );

    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Save Kanchi Silk to wishlist"]',
      )?.disabled,
    ).toBe(true);
  });

  it("keeps a sold save removable on the Wishlist page, and nowhere else", async () => {
    setVerdict("sold");
    mocks.wishlist.isSaved = true;
    await render(<ProductCard product={saree} allowSoldWishlistRemoval />);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Remove Kanchi Silk from wishlist"]',
      )?.disabled,
    ).toBe(false);

    await render(<ProductCard product={saree} />);
    expect(heart()).toBeNull();
  });
});

describe("product page badge and notice", () => {
  // HEAD's server-rendered StockBadge, class for class.
  const HELD_BADGE_CLASS =
    "rounded-full border border-[#601D1C]/20 bg-[#601D1C]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#601D1C] shadow-none";
  const IN_STOCK_BADGE_CLASS =
    "rounded-full border border-[#141D46]/15 bg-[#141D46]/8 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#141D46] shadow-none";
  const AVAILABLE_NOTICE_CLASS = "text-xs leading-5 text-[#141D46]/58";

  const renderAvailability = (initialStatus: "available" | "reserved" | "sold") =>
    render(
      <>
        <div data-pdp-badge="">
          <PdpStockBadge productId={PRODUCT_ID} initialStatus={initialStatus} />
        </div>
        <div data-pdp-notice="">
          <PdpAvailabilityNotice
            productId={PRODUCT_ID}
            initialStatus={initialStatus}
            availableCopy={AVAILABLE_COPY}
            reservedCopy={RESERVED_COPY}
            soldCopy={SOLD_COPY}
          />
        </div>
        <div data-server-badges="">
          <Badge className={HELD_BADGE_CLASS}>Reserved</Badge>
          <Badge className={IN_STOCK_BADGE_CLASS}>In stock</Badge>
          <Badge className={HELD_BADGE_CLASS}>Sold</Badge>
        </div>
      </>,
    );

  const badge = () => container.querySelector("[data-pdp-badge]")!.innerHTML;
  const serverBadge = (label: string) =>
    Array.from(container.querySelector("[data-server-badges]")!.children).find(
      (candidate) => textOf(candidate) === label,
    )!.outerHTML;
  const notice = () => container.querySelector("[data-pdp-notice]");

  it.each([
    ["in_my_cart", "reserved"],
    ["in_my_cart", "available"],
    ["payment_pending", "reserved"],
    ["payment_pending", "available"],
  ] as const)(
    "%s (server rendered %s): the server's Reserved badge, and a notice that never names another buyer",
    async (state, initialStatus) => {
      // The shopper's own hold, which the verdict carries until it expires.
      setVerdict(state, HOLD_UNTIL);
      await renderAvailability(initialStatus);

      expect(badge()).toBe(serverBadge("Reserved"));
      expect(textOf(notice())).toBe(AVAILABLE_COPY);
      expect(notice()?.querySelector("p")?.className).toBe(
        AVAILABLE_NOTICE_CLASS,
      );
      expect(textOf(notice())).not.toContain("another buyer");
    },
  );

  it.each(["available", "reserved"] as const)(
    "in_my_cart with no hold (server rendered %s): a made-to-order blouse in the bag stays In stock",
    async (initialStatus) => {
      // A made-to-order line holds nothing, so its verdict has no expiry.
      setVerdict("in_my_cart");
      await renderAvailability(initialStatus);

      expect(badge()).toBe(serverBadge("In stock"));
      expect(textOf(notice())).toBe(AVAILABLE_COPY);
    },
  );

  it("reserved_by_other: Reserved, held by another buyer", async () => {
    setVerdict("reserved_by_other");
    await renderAvailability("available");

    expect(badge()).toBe(serverBadge("Reserved"));
    expect(textOf(notice())).toBe(RESERVED_COPY);
  });

  it("sold: Sold, with the sold copy", async () => {
    setVerdict("sold");
    await renderAvailability("available");

    expect(badge()).toBe(serverBadge("Sold"));
    expect(textOf(notice())).toBe(SOLD_COPY);
  });

  it("available: In stock, with the available copy, once a hold is released", async () => {
    setVerdict("available");
    await renderAvailability("reserved");

    expect(badge()).toBe(serverBadge("In stock"));
    expect(textOf(notice())).toBe(AVAILABLE_COPY);
    expect(notice()?.querySelector("p")?.className).toBe(AVAILABLE_NOTICE_CLASS);
  });

  it.each([
    ["available", "In stock", AVAILABLE_COPY],
    ["reserved", "Reserved", RESERVED_COPY],
    ["sold", "Sold", SOLD_COPY],
  ] as const)(
    "checking: keeps the server-rendered %s answer until a verdict arrives",
    async (initialStatus, label, copy) => {
      setVerdict("checking");
      await renderAvailability(initialStatus);

      expect(badge()).toBe(serverBadge(label));
      expect(textOf(notice())).toBe(copy);
    },
  );
});

describe("blouse product page", () => {
  it("sold: the Sold button stays, with no size selector, heart or sticky Select size", async () => {
    setVerdict("sold");
    await render(
      <>
        <BlousePurchaseControls product={blouse} initialStatus="sold" />
        <BlouseStickyAction product={blouse} initialStatus="sold" />
      </>,
    );

    const sold = buttons().filter((candidate) => textOf(candidate) === "Sold");
    expect(sold).toHaveLength(2);
    expect(sold.every((candidate) => candidate.disabled)).toBe(true);
    expect(container.querySelector("#blouse-size-selector")).toBeNull();
    expect(container.querySelector('a[href="#blouse-size-selector"]')).toBeNull();
    expect(heart()).toBeNull();
  });

  it("available: the sticky bar still jumps to the size selector", async () => {
    setVerdict("available");
    await render(<BlouseStickyAction product={blouse} initialStatus="available" />);

    expect(
      textOf(container.querySelector('a[href="#blouse-size-selector"]')),
    ).toBe("Select size");
  });

  it("in_my_cart: the sticky bar reads In bag with its trash, not Select size", async () => {
    setVerdict("in_my_cart");
    await render(<BlouseStickyAction product={blouse} initialStatus="available" />);

    expect(container.querySelector('a[href="#blouse-size-selector"]')).toBeNull();
    expect(button("In bag")?.disabled).toBe(true);
    expect(removeControls()).toHaveLength(1);
    expect(removeControls()[0].disabled).toBe(false);
  });

  it("checking: the size selector stays mounted while the verdict loads", async () => {
    setVerdict("checking");
    await render(
      <BlousePurchaseControls product={blouse} initialStatus="available" />,
    );

    expect(container.querySelector("#blouse-size-selector")).not.toBeNull();
    expect(button("Checking…")?.disabled).toBe(true);
  });

  it.each(["payment_pending", "reserved_by_other"])(
    "%s: no size selector, because nobody can size it now",
    async (state) => {
      setVerdict(state, HOLD_UNTIL);
      await render(
        <BlousePurchaseControls product={blouse} initialStatus="available" />,
      );

      expect(container.querySelector("#blouse-size-selector")).toBeNull();
    },
  );
});

describe("Drape Room for a sold saree", () => {
  /** Only the timers the launch trigger runs on; React keeps its own. */
  const useLaunchTimers = () =>
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
    useDrapeRoomOperationalStore.getState().close();
  });

  describe("standalone trigger, as the product page renders it", () => {
    it("sold: renders nothing at all", async () => {
      setVerdict("sold");
      await render(<DrapeRoomTrigger product={drapeSaree} />);

      expect(drapeTrigger()).toBeNull();
      expect(container.innerHTML).toBe("");
    });

    it("available: is live", async () => {
      setVerdict("available");
      await render(<DrapeRoomTrigger product={drapeSaree} />);

      expect(drapeTrigger()?.disabled).toBe(false);
    });
  });

  describe("product page launch entry", () => {
    /** Past the gallery trigger's settle delay, with no other overlay open. */
    const passGalleryTrigger = () =>
      act(async () => {
        vi.advanceTimersByTime(1_000);
      });

    beforeEach(() => {
      window.sessionStorage.clear();
    });

    it("sold: no persistent entry, even after the gallery would open the teaser", async () => {
      useLaunchTimers();
      setVerdict("sold");
      await render(
        <DrapeLaunchProductEntry product={drapeSaree} viewedGalleryCount={3} />,
      );
      await passGalleryTrigger();

      expect(container.querySelector("[data-ftt-drape-persistent]")).toBeNull();
      expect(container.innerHTML).toBe("");
    });

    it("available: the gallery opens the teaser and leaves the persistent entry", async () => {
      useLaunchTimers();
      setVerdict("available");
      await render(
        <DrapeLaunchProductEntry product={drapeSaree} viewedGalleryCount={3} />,
      );
      await passGalleryTrigger();

      expect(
        container.querySelector("[data-ftt-drape-persistent]"),
      ).not.toBeNull();
    });
  });

  describe("inside the room, with a saved preview on screen", () => {
    const tryOnConfig: PublicTryOnConfig = {
      aspectRatio: "3:4",
      disclosureVersion: "disclosure-v1",
      enabled: true,
      engineVersion: "engine-v1",
      imageSize: "1K",
      model: "image-model-v1",
      outputMimeType: "image/jpeg",
      outputVersion: "output-v1",
      privacyPolicyVersion: "privacy-v1",
      promptVersion: "prompt-v1",
      provider: "google",
      providerDisplayName: "Google",
      providerPolicyUrl: "https://example.com/provider-policy",
      providerRetentionSummary: "Not retained after the preview is made.",
      referenceContractVersion: "gallery-v2",
    };
    const availability: DrapeRoomAvailability = {
      config: tryOnConfig,
      configStatus: "ready",
      consentToken: "consent-token",
      generationAvailable: true,
      uiAvailable: true,
    };
    const transport = {
      generate: vi.fn(),
      loadConfig: vi.fn(async () => null),
    } as unknown as DrapeRoomClientTransport;

    const slot = (name: "add-to-cart" | "wishlist") =>
      container.querySelector(`[data-drape-primary-action="${name}"]`);
    const slotTile = (name: "add-to-cart" | "wishlist") =>
      slot(name)?.querySelector<HTMLButtonElement>("[data-drape-action-tile]");
    const generationFlag = () =>
      container
        .querySelector("[data-generation-available]")
        ?.getAttribute("data-generation-available");
    const uncachedBackground = () =>
      container.querySelector<HTMLButtonElement>(
        '[data-drape-background="festival"]',
      );

    const renderRoom = async () => {
      useDrapeRoomOperationalStore.getState().open(drapeSaree);
      await render(
        <DrapeRoomExperience
          availability={availability}
          onRefreshConfig={async () => {}}
          transport={transport}
        />,
      );
      await flush();
    };

    it("sold: no wishlist or add tile, not even a placeholder, and no new generation", async () => {
      setVerdict("sold");
      await renderRoom();

      expect(slot("wishlist")).not.toBeNull();
      expect(slotTile("wishlist")).toBeNull();
      expect(slotTile("add-to-cart")).toBeNull();
      expect(heart()).toBeNull();
      // Saving and visiting stay: neither buys anything.
      expect(
        Array.from(
          container.querySelectorAll("[data-drape-action-tile]"),
          (candidate) => textOf(candidate),
        ),
      ).toEqual(["Save image", "Visit product"]);
      expect(generationFlag()).toBe("false");
      expect(uncachedBackground()?.disabled).toBe(true);
    });

    it("available: the wishlist and add tiles are live, and generation is open", async () => {
      setVerdict("available");
      await renderRoom();

      expect(slotTile("wishlist")?.getAttribute("aria-label")).toBe(
        "Save Kanchi Silk to wishlist",
      );
      expect(textOf(slotTile("add-to-cart"))).toBe("Add to bag");
      expect(slotTile("add-to-cart")?.disabled).toBe(false);
      expect(generationFlag()).toBe("true");
      expect(uncachedBackground()?.disabled).toBe(false);
    });
  });
});

describe("a refused Notify me", () => {
  const announcements: ViewerStateAnnouncement[] = [];
  const record = (event: Event) =>
    announcements.push((event as CustomEvent<ViewerStateAnnouncement>).detail);
  const refuse = (body: Record<string, unknown>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => body, ok: false, status: 409 })),
    );

  beforeEach(() => {
    announcements.length = 0;
    window.addEventListener(VIEWER_STATE_EVENT, record);
  });

  afterEach(() => {
    window.removeEventListener(VIEWER_STATE_EVENT, record);
  });

  it("on a card applies the server's verdict and says the piece sold", async () => {
    setVerdict("reserved_by_other");
    refuse({
      code: "PRODUCT_SOLD",
      message: "This saree has found its next home.",
      viewerState: "sold",
    });
    await render(<ProductCard product={saree} />);

    await act(async () => {
      button("Notify me")?.click();
    });
    await flush();

    expect(announcements).toEqual([
      {
        productId: PRODUCT_ID,
        reservedUntil: null,
        state: "sold",
        viewerKey: `user:${USER_ID}`,
      },
    ]);
    expect(mocks.toast.message).toHaveBeenCalledWith(SOLD_COPY, undefined);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("on the product page tells the holder the piece is already theirs", async () => {
    setVerdict("reserved_by_other");
    const cart = makeServerCart();
    mocks.serverCart = cart;
    refuse({
      code: "NOTIFY_OWN_HOLD",
      message: "This piece is held for you.",
      viewerState: "in_my_cart",
    });
    await render(<AddToCartButton product={saree} />);

    await act(async () => {
      button("Notify me")?.click();
    });
    await flush();

    expect(announcements.map((announcement) => announcement.state)).toEqual([
      "in_my_cart",
    ]);
    expect(mocks.toast.message).toHaveBeenCalledWith(
      "This piece is already in your bag",
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(cart.refresh).toHaveBeenCalled();
  });

  it("never applies a malformed verdict, but still explains a known refusal", async () => {
    setVerdict("reserved_by_other");
    refuse({ code: "PRODUCT_AVAILABLE", viewerState: "bogus" });
    await render(<ProductCard product={saree} />);

    await act(async () => {
      button("Notify me")?.click();
    });
    await flush();

    expect(announcements).toEqual([]);
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "This piece is available now",
      expect.anything(),
    );
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("keeps the retry message for a failure that is not a refusal", async () => {
    setVerdict("reserved_by_other");
    refuse({ code: "INTERNAL_ERROR" });
    await render(<AddToCartButton product={saree} />);

    await act(async () => {
      button("Notify me")?.click();
    });
    await flush();

    expect(announcements).toEqual([]);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Unable to register. Please try again.",
    );
  });
});
