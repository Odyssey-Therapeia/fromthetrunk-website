// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  replayAddToBagAtOrigin,
  subscribeToAddToBagReplay,
} from "@/lib/commerce/add-to-bag-replay";

const intent = {
  id: "intent-1",
  productId: "11111111-1111-4111-8111-111111111111",
  source: "product-card",
  type: "add-to-cart",
} as const;

describe("add-to-bag replay", () => {
  it("lets at most one matching mounted origin run the command", async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    const stopFirst = subscribeToAddToBagReplay(first);
    const stopSecond = subscribeToAddToBagReplay(second);

    await expect(replayAddToBagAtOrigin(intent)).resolves.toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    stopFirst();
    stopSecond();
  });

  it("reports unhandled so the global runner can use its one-POST fallback", async () => {
    await expect(replayAddToBagAtOrigin(intent)).resolves.toBe(false);
  });

  it("lets a non-matching listener decline without swallowing the intent", async () => {
    const decline = vi.fn(() => false as const);
    const handle = vi.fn(async () => undefined);
    const stopDecline = subscribeToAddToBagReplay(decline);
    const stopHandle = subscribeToAddToBagReplay(handle);

    await expect(replayAddToBagAtOrigin(intent)).resolves.toBe(true);
    expect(decline).toHaveBeenCalledOnce();
    expect(handle).toHaveBeenCalledOnce();

    stopDecline();
    stopHandle();
  });
});
