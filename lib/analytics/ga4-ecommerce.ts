/**
 * Canonical GA4 ecommerce event builders.
 *
 * Internal FTT analytics continue using their existing event names and payloads.
 * These helpers build the separate GA4 representation pushed through GTM.
 *
 * Monetary values entering this module are in paise. GA4 values are emitted in
 * rupees with currency explicitly set to INR.
 */

export type Ga4EcommerceEventName =
  | "view_item"
  | "select_item"
  | "add_to_cart";

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity: number;
};

export type Ga4EcommerceParams = {
  currency: "INR";
  value: number;
  items: Ga4Item[];
  source?: string;
  stock_status?: string;
};

export type Ga4EcommerceEvent = {
  name: Ga4EcommerceEventName;
  params: Ga4EcommerceParams;
};

export type Ga4ItemInput = {
  id: string;
  name: string;
  pricePaise: number;
  category?: string | null;
  variant?: string | null;
  quantity?: number;
};

export type Ga4EventContext = {
  source?: string;
  stockStatus?: string;
};

/**
 * Convert the application's integer-paise representation into the currency
 * units GA4 expects.
 *
 * Example: 500000 paise → 5000 rupees.
 */
export function paiseToRupees(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, value) / 100;
}

function optionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function buildGa4Item(input: Ga4ItemInput): Ga4Item {
  const quantity =
    typeof input.quantity === "number" && Number.isFinite(input.quantity)
      ? Math.max(1, Math.floor(input.quantity))
      : 1;

  return {
    item_id: input.id,
    item_name: input.name,
    ...(optionalText(input.category)
      ? { item_category: optionalText(input.category) }
      : {}),
    ...(optionalText(input.variant)
      ? { item_variant: optionalText(input.variant) }
      : {}),
    price: paiseToRupees(input.pricePaise),
    quantity,
  };
}

function buildEcommerceEvent(
  name: Ga4EcommerceEventName,
  itemInput: Ga4ItemInput,
  context: Ga4EventContext = {},
): Ga4EcommerceEvent {
  const item = buildGa4Item(itemInput);

  return {
    name,
    params: {
      currency: "INR",
      value: item.price * item.quantity,
      items: [item],
      ...(optionalText(context.source)
        ? { source: optionalText(context.source) }
        : {}),
      ...(optionalText(context.stockStatus)
        ? { stock_status: optionalText(context.stockStatus) }
        : {}),
    },
  };
}

export function buildViewItemEvent(
  item: Ga4ItemInput,
  context: Ga4EventContext = {},
): Ga4EcommerceEvent {
  return buildEcommerceEvent("view_item", item, context);
}

export function buildSelectItemEvent(
  item: Ga4ItemInput,
  context: Ga4EventContext = {},
): Ga4EcommerceEvent {
  return buildEcommerceEvent("select_item", item, context);
}

export function buildAddToCartEvent(
  item: Ga4ItemInput,
  context: Ga4EventContext = {},
): Ga4EcommerceEvent {
  return buildEcommerceEvent("add_to_cart", item, context);
}
