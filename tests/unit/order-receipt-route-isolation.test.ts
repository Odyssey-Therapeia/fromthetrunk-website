import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewableOrderMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orders/viewable-order", () => ({
  getViewableOrder: getViewableOrderMock,
}));

import { GET } from "@/app/(site)/checkout/confirmation/receipt/route";
import type { Order } from "@/types/domain";

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const paidOrder = {
  cartFingerprint: null,
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
  discountCode: null,
  discountId: null,
  events: [],
  giftFrom: null,
  giftMessage: null,
  id: ORDER_ID,
  idempotencyKey: null,
  internalNote: null,
  isGift: false,
  items: [
    {
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      imageUrl: null,
      name: "Synthetic Saree",
      orderId: ORDER_ID,
      pricePaise: 150000,
      productId: null,
      quantity: 1,
      selectedOptions: {},
    },
  ],
  paidAt: new Date("2026-07-01T10:05:00.000Z"),
  paymentGateway: "razorpay",
  paymentId: "pay_synthetic",
  paymentMethod: "upi",
  paymentStatus: "paid",
  placedAt: new Date("2026-07-01T10:00:00.000Z"),
  razorpayOrderId: "plink_synthetic",
  refundedAmountPaise: null,
  refundedAt: null,
  refundId: null,
  reminderSentAt: null,
  shippingCity: "Mumbai",
  shippingCostPaise: 0,
  shippingCountry: "India",
  shippingEmail: "receipt@example.test",
  shippingLine1: "Synthetic address",
  shippingLine2: null,
  shippingMethod: "standard",
  shippingName: "Synthetic Buyer",
  shippingPhone: null,
  shippingPostalCode: "400001",
  shippingState: "Maharashtra",
  status: "confirmed",
  subtotalPaise: 150000,
  taxAmountPaise: 0,
  taxRate: "0.00",
  totalPaise: 150000,
  trackingCarrier: null,
  trackingNumber: null,
  updatedAt: new Date("2026-07-01T10:05:00.000Z"),
  userId: "11111111-1111-4111-8111-111111111111",
} satisfies Order;

const receiptRequest = (params: Record<string, string>) =>
  new NextRequest(`https://test.fromthetrunk.test/checkout/confirmation/receipt?${new URLSearchParams(params)}`);

describe("checkout receipt route isolation", () => {
  beforeEach(() => {
    getViewableOrderMock.mockReset();
  });

  it("returns 404 when the order is not viewable by session or token", async () => {
    getViewableOrderMock.mockResolvedValueOnce(null);

    const response = await GET(receiptRequest({ key: "wrong-token", orderId: ORDER_ID }));
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(json.message).toBe("Receipt not found.");
  });

  it("returns 409 for a viewable order before payment is confirmed", async () => {
    getViewableOrderMock.mockResolvedValueOnce({
      ...paidOrder,
      paidAt: null,
      paymentStatus: "pending",
      status: "pending",
    });

    const response = await GET(receiptRequest({ key: "valid-token", orderId: ORDER_ID }));
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(json.message).toBe("Receipt is available after payment is confirmed.");
  });

  it("returns a no-store noindex receipt for a viewable paid order", async () => {
    getViewableOrderMock.mockResolvedValueOnce(paidOrder);

    const response = await GET(receiptRequest({ key: "valid-token", orderId: ORDER_ID }));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("ftt-receipt-AAAAAAAA.html");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(html).toContain("Receipt #AAAAAAAA");
  });
});
