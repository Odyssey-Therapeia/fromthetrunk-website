import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { POST } from "@/app/api/orders/route";

const shippingAddress = {
  city: "Mumbai",
  country: "India",
  email: "buyer@example.com",
  line1: "12 Heritage Lane",
  name: "A Buyer",
  phone: "+91 99999 00000",
  postalCode: "400001",
  state: "MH",
};

describe("/api/orders POST (deprecated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 410 Gone — endpoint has moved to /api/payments/create-order", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toMatchObject({
      code: "ENDPOINT_MOVED",
    });
  });
});
