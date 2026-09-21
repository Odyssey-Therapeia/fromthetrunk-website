import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("checkout cart authority", () => {
  const checkout = read("components/checkout/checkout-page-client.tsx");

  it("checks the viewer's whole bag in one authenticated batch", () => {
    expect(checkout).toContain('fetch("/api/v2/products/viewer-state"');
    expect(checkout.match(/products\/viewer-state/g)).toHaveLength(1);
    expect(checkout).toContain("body: JSON.stringify({ productIds })");
    expect(checkout).not.toContain("resolveViewerAvailability");
  });

  it("never infers ownership from a browser reservation token", () => {
    const paymentPayload = checkout.slice(
      checkout.indexOf("await payment.startPayment"),
      checkout.indexOf("prefill:", checkout.indexOf("await payment.startPayment")),
    );
    expect(paymentPayload).not.toContain("reservationToken");
  });

  it("stamps the precheck as it leaves, so a removal made while it travels outranks it", () => {
    const precheck = checkout.slice(
      checkout.indexOf("const recheckCheckoutAvailability"),
      checkout.indexOf("const addressesQuery"),
    );
    const stampedAt = precheck.indexOf("readViewerStateSequence()");
    expect(stampedAt).toBeGreaterThan(-1);
    expect(stampedAt).toBeLessThan(
      precheck.indexOf('fetch("/api/v2/products/viewer-state"'),
    );
    expect(precheck).toContain("sentAtSequence,");
  });

  it("asks the cards again only for an outcome that changed the bag", () => {
    // The precheck has already announced its verdicts, so its bag read is a
    // plain re-read. A create-order conflict or a paid order changed the bag.
    const precheck = checkout.slice(
      checkout.indexOf("const recheckCheckoutAvailability"),
      checkout.indexOf("const addressesQuery"),
    );
    expect(precheck).toContain("await refreshServerCart()");
    expect(precheck).not.toContain("refreshAfterBagChange");

    const onConflict = checkout.slice(
      checkout.indexOf("onAvailabilityError:"),
      checkout.indexOf("onPaid:"),
    );
    expect(onConflict).toContain("refresh: refreshAfterBagChange");

    const paidAt = checkout.indexOf("onPaid:");
    const onPaid = checkout.slice(paidAt, checkout.indexOf("} finally {", paidAt));
    expect(onPaid).toContain("await refreshAfterBagChange()");
    expect(onPaid).not.toContain("refreshServerCart");
  });

  it("does not release a line as a side effect of the precheck", () => {
    const precheck = checkout.slice(
      checkout.indexOf("const recheckCheckoutAvailability"),
      checkout.indexOf("const addressesQuery"),
    );
    expect(precheck).not.toContain("removeFromBag");
  });

  it("gates payment on the verdicts its lines draw, never on row status", () => {
    // A cart row's status is only ever active or payment_pending, so a check
    // for "sold" there could never fire. The summary lines report the shared
    // viewer verdict, and payment is blocked on exactly that answer.
    expect(checkout).not.toContain('item.status === "sold"');
    expect(checkout).toContain('lineVerdictFor(item) === "sold"');
    expect(checkout).toContain('lineVerdictFor(item) === "checking"');
    const payGate = checkout.slice(
      checkout.indexOf("const payBlockedByConflict"),
      checkout.indexOf("const handleCheckoutAuthSuccess"),
    );
    expect(payGate).toContain("hasSoldCartItem");
    expect(payGate).toContain("hasUncheckedCartItem");
    expect(checkout.match(/onViewerState=\{reportLineVerdict\}/g)).toHaveLength(2);
  });

  it("routes create-order conflicts through the removal guard", () => {
    const onConflict = checkout.slice(
      checkout.indexOf("onAvailabilityError:"),
      checkout.indexOf("onPaid:"),
    );
    expect(onConflict).toContain("applyCheckoutConflict(");
    expect(onConflict).not.toContain("removeFromBag(productId)");
  });

  it("awaits explicit checkout removals", () => {
    expect(checkout).toContain("const handleRemoveItem = async");
    expect(checkout).toContain("const result = await removeFromBag(id)");
  });

  it("reconciles paid rows from the server instead of clearing the whole bag", () => {
    const confirmation = read(
      "app/(site)/checkout/confirmation/clear-cart-on-confirmation.tsx",
    );
    expect(checkout).not.toContain("clearCart()");
    expect(confirmation).not.toContain("clearCart()");
    expect(confirmation).toContain("void refresh()");
    expect(checkout).toContain("await refreshServerCart()");
  });
});
