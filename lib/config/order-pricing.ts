type NumberEnvOptions = {
  allowZero?: boolean;
};

/**
 * Reads a numeric environment override with a safe fallback.
 *
 * @param name - Environment variable name used in validation errors.
 * @param rawValue - Direct process.env value read at the export call site.
 * @param fallback - Number to use when the environment variable is missing or blank.
 * @param options - Parsing options. `allowZero` defaults to true.
 * @returns The parsed finite number, or the fallback when the variable is empty.
 *
 * Accepted inputs are standard numeric strings such as "0.12", "500", or
 * "25000". The function throws when the value is not finite, negative, or zero
 * while `allowZero` is false.
 */
const parseNumberEnv = (
  name: string,
  rawValue: string | undefined,
  fallback: number,
  { allowZero = true }: NumberEnvOptions = {}
) => {
  const value =
    rawValue && rawValue.trim().length > 0 ? Number(rawValue) : fallback;

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }

  if (value < 0 || (!allowZero && value === 0)) {
    throw new Error(
      `${name} must be ${allowZero ? "a non-negative" : "a positive"} number.`
    );
  }

  return value;
};

/**
 * Reads a decimal-rate environment override.
 *
 * @param name - Environment variable name used in validation errors.
 * @param rawValue - Direct process.env value read at the export call site.
 * @param fallback - Decimal rate to use when the environment variable is missing or blank.
 * @returns A finite decimal rate in the inclusive range 0 to 1.
 *
 * Accepted inputs include values such as "0", "0.05", "0.12", and "1". The
 * function throws for the same invalid number cases as `parseNumberEnv`, and
 * also throws when the parsed rate is greater than 1.
 */
const parseRateEnv = (
  name: string,
  rawValue: string | undefined,
  fallback: number
) => {
  const value = parseNumberEnv(name, rawValue, fallback);

  if (value > 1) {
    throw new Error(`${name} must be a decimal rate between 0 and 1.`);
  }

  return value;
};

/** GST rate for textile and apparel products in India. */
export const GST_RATE = parseRateEnv(
  "NEXT_PUBLIC_FTT_GST_RATE",
  process.env.NEXT_PUBLIC_FTT_GST_RATE,
  0.12
);

/**
 * Free shipping is DISABLED — every order is charged the standard shipping rate
 * regardless of subtotal. Flip to `true` to re-enable the free-shipping
 * threshold below in BOTH the client estimate (isFreeShipping) and the server
 * charge (toShippingCostPaise).
 */
export const ENABLE_FREE_SHIPPING: boolean = false;

/**
 * LAUNCH PRICING SWITCHES (restore-friendly).
 *
 * For now shipping is FREE on every order and GST is NOT charged. Both are gated
 * behind these flags so the original charged-pricing logic (SHIPPING_TIERS +
 * toShippingCostPaise, GST_RATE + calculateOrderTotals) stays fully intact and
 * can be restored by setting the env var to "true" (or flipping the default
 * here). The `NEXT_PUBLIC_` prefix keeps client (estimate) and server
 * (calculateOrderTotals) in lock-step when re-enabled.
 *
 * Default (env unset) => false => shipping free / no GST, everywhere.
 */
export const ENABLE_SHIPPING_CHARGES: boolean =
  process.env.NEXT_PUBLIC_FTT_ENABLE_SHIPPING_CHARGES === "true";

export const ENABLE_GST: boolean =
  process.env.NEXT_PUBLIC_FTT_ENABLE_GST === "true";

/** Shipping cost tiers in INR. */
export const SHIPPING_TIERS = {
  /** Free-shipping threshold in INR (only applies when ENABLE_FREE_SHIPPING). */
  freeThreshold: parseNumberEnv(
    "NEXT_PUBLIC_FTT_SHIPPING_FREE_THRESHOLD",
    process.env.NEXT_PUBLIC_FTT_SHIPPING_FREE_THRESHOLD,
    25000
  ),
  standard: parseNumberEnv(
    "NEXT_PUBLIC_FTT_SHIPPING_STANDARD",
    process.env.NEXT_PUBLIC_FTT_SHIPPING_STANDARD,
    250,
    {
      allowZero: false,
    }
  ),
  express: parseNumberEnv(
    "NEXT_PUBLIC_FTT_SHIPPING_EXPRESS",
    process.env.NEXT_PUBLIC_FTT_SHIPPING_EXPRESS,
    600,
    {
      allowZero: false,
    }
  ),
} as const;

export type ShippingMethod = Exclude<keyof typeof SHIPPING_TIERS, "freeThreshold">;
