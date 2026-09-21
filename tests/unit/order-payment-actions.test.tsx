// @vitest-environment jsdom
/**
 * Account order payment actions, rendered.
 *
 *   - A failed order offers no Repay: its hold is already restored or
 *     released, so there is no payment window left.
 *   - Reorder counts the requester's own exact holds (inBag) without claiming
 *     them again through addToBag.
 *   - Existing Button classes stay exactly as they were.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const addToBagMock = vi.hoisted(() => vi.fn());
const addItemMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/lib/commerce/use-server-cart", () => ({
  useServerCart: () => ({ addToBag: addToBagMock }),
}));

vi.mock("@/lib/store/cart-store", () => ({
  useCartStore: (selector: (state: { addItem: typeof addItemMock }) => unknown) =>
    selector({ addItem: addItemMock }),
}));

import { OrderPaymentActions } from "@/components/account/order-payment-actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn();

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = async (paymentStatus: "failed" | "pending") => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <OrderPaymentActions orderId={ORDER_ID} paymentStatus={paymentStatus} />,
    );
  });
  return container;
};

const buttonNamed = (name: string) =>
  Array.from(container!.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(name),
  );

/** Let the click handler's fetch, json and loop settle. */
const settle = async () => {
  for (let tick = 0; tick < 10; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const previewItem = (
  productId: string,
  overrides: Record<string, unknown> = {},
) => ({
  available: false,
  image: `/images/${productId}.jpg`,
  inBag: false,
  name: `Saree ${productId}`,
  originalPricePaise: null,
  pricePaise: 250_000,
  productId,
  selectedOptions: {},
  slug: `saree-${productId}`,
  ...overrides,
});

const reorderWith = async (items: unknown[]) => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ items }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  );
  await render("failed");
  await act(async () => {
    buttonNamed("Reorder")!.click();
  });
  await settle();
};

beforeEach(() => {
  pushMock.mockReset();
  addToBagMock.mockReset();
  addItemMock.mockReset();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  addToBagMock.mockResolvedValue({ ok: true, viewerState: "in_my_cart" });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("OrderPaymentActions — repay", () => {
  it("offers no Repay for a failed order but keeps Reorder with its classes", async () => {
    await render("failed");

    expect(buttonNamed("Repay")).toBeUndefined();
    const reorder = buttonNamed("Reorder");
    expect(reorder).toBeDefined();
    expect(reorder!.className).toContain("rounded-full");
    // The copy no longer points at a Repay control that is not there.
    expect(container!.textContent).not.toContain("Repay");
  });

  it("keeps Repay, with its classes, for a pending order", async () => {
    await render("pending");

    const repay = buttonNamed("Repay");
    expect(repay).toBeDefined();
    expect(repay!.className).toContain("rounded-full");
    expect(repay!.className).toContain("text-[#FDF7F1]");
    expect(buttonNamed("Reorder")).toBeUndefined();
  });
});

describe("OrderPaymentActions — reorder", () => {
  it("counts pieces already in the bag without claiming them again", async () => {
    await reorderWith([
      previewItem("held", { inBag: true }),
      previewItem("free", { available: true }),
      previewItem("gone"),
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v2/orders/${ORDER_ID}/reorder-preview`,
      expect.anything(),
    );
    expect(addToBagMock).toHaveBeenCalledTimes(1);
    expect(addToBagMock).toHaveBeenCalledWith({ productId: "free" });
    expect(addItemMock).toHaveBeenCalledTimes(1);
    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "free", slug: "saree-free" }),
    );
    expect(toastMock.success).toHaveBeenCalledWith(
      "1 added to your bag · 1 already in your bag · 1 no longer available",
    );
    expect(pushMock).toHaveBeenCalledWith("/cart");
  });

  it("sends the shopper to the bag when every piece is already theirs", async () => {
    await reorderWith([
      previewItem("held-a", { inBag: true }),
      previewItem("held-b", { inBag: true }),
    ]);

    expect(addToBagMock).not.toHaveBeenCalled();
    expect(addItemMock).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("2 already in your bag");
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/cart");
  });

  it("reports nothing available when no piece is free or already held", async () => {
    await reorderWith([previewItem("gone-a"), previewItem("gone-b")]);

    expect(addToBagMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      "These pieces are no longer available.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
