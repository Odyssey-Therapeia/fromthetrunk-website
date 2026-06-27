import { describe, expect, it } from "vitest";

import { buildOrderReceiptHtml, getShippingAddressLines } from "@/lib/orders/receipt-html";
import type { Order } from "@/types/domain";

const baseOrder = {
  createdAt: new Date("2026-06-26T10:49:25.701Z"),
  discountCode: "LAUNCH",
  discountId: null,
  events: [],
  id: "14ad266a-8682-4579-8265-ca21aa374b65",
  internalNote: null,
  items: [
    {
      createdAt: new Date("2026-06-26T10:49:25.701Z"),
      id: "8dfd5f4e-8410-4f5d-9b69-40bcf022a83e",
      imageUrl: null,
      name: "Marigold Tissue Silk Saree",
      orderId: "14ad266a-8682-4579-8265-ca21aa374b65",
      pricePaise: 200000,
      productId: null,
      quantity: 2,
    },
  ],
  paymentGateway: "razorpay",
  paymentId: "pay_123",
  paymentMethod: null,
  paymentStatus: "paid",
  placedAt: new Date("2026-06-26T10:49:25.701Z"),
  razorpayOrderId: "plink_123",
  refundedAmountPaise: null,
  refundedAt: null,
  refundId: null,
  reminderSentAt: null,
  isGift: false,
  giftFrom: null,
  giftMessage: null,
  shippingCity: "Bengaluru",
  shippingCostPaise: 15000,
  shippingCountry: "India",
  shippingEmail: "hello&test@example.com",
  shippingLine1: "Line <script>alert(1)</script>",
  shippingLine2: "",
  shippingMethod: "standard",
  shippingName: "Customer <Name>",
  shippingPhone: "+910000000000",
  shippingPostalCode: "560077",
  shippingState: "Karnataka",
  status: "confirmed",
  subtotalPaise: 400000,
  taxAmountPaise: 48000,
  taxRate: "0.12",
  totalPaise: 463000,
  trackingCarrier: null,
  trackingNumber: null,
  updatedAt: new Date("2026-06-26T10:49:25.701Z"),
  userId: null,
} satisfies Order;

describe("buildOrderReceiptHtml", () => {
  it("renders the order receipt with itemized totals", () => {
    const html = buildOrderReceiptHtml(baseOrder, new Date("2026-06-26T11:00:00.000Z"));

    expect(html).toContain("Receipt #14AD266A");
    expect(html).toContain("Marigold Tissue Silk Saree");
    expect(html).toContain("Qty 2");
    expect(html).toContain("Amount paid");
    expect(html).toContain("4,630");
    expect(html).toContain("LAUNCH");
    expect(html).toContain("Payment ID: pay_123");
  });

  it("escapes customer-entered receipt content", () => {
    const html = buildOrderReceiptHtml(baseOrder, new Date("2026-06-26T11:00:00.000Z"));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("hello&test@example.com");
    expect(html).toContain("Customer &lt;Name&gt;");
    expect(html).toContain("Line &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("hello&amp;test@example.com");
  });

  it("uses createdAt when placedAt is missing at runtime", () => {
    const order = {
      ...baseOrder,
      placedAt: null as unknown as Date,
    };

    const html = buildOrderReceiptHtml(order, new Date("2026-06-26T11:00:00.000Z"));

    expect(html).toContain("Order placed 26 Jun 2026");
    expect(html).not.toContain("1 Jan 1970");
  });
});

describe("getShippingAddressLines", () => {
  it("omits blank optional address lines", () => {
    expect(getShippingAddressLines(baseOrder)).toEqual([
      "Customer <Name>",
      "Line <script>alert(1)</script>",
      "Bengaluru, Karnataka, 560077",
      "India",
    ]);
  });
});
