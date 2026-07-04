export type OneOfOneConflictCode =
  | "CHECKOUT_ATTEMPT_NOT_REUSABLE"
  | "CHECKOUT_CART_CHANGED"
  | "CHECKOUT_IN_PROGRESS"
  | "GENERIC_CREATE_ORDER_FAILURE"
  | "INVALID_PRODUCT_IDS"
  | "PRODUCT_RESERVED"
  | "PRODUCT_SOLD"
  | "PRODUCT_UNAVAILABLE"
  | "RESERVATION_CONFLICT"
  | "RESERVATION_EXPIRED"
  | "TOO_MANY_PENDING_ORDERS";

export type OneOfOneConflictCopy = {
  blockPayment: boolean;
  code: OneOfOneConflictCode;
  ctaHref?: string;
  ctaLabel: string;
  message: string;
  removeProduct: boolean;
  title: string;
};

const reservedCopy = {
  blockPayment: true,
  ctaHref: "/collection",
  ctaLabel: "Explore other sarees",
  message:
    "Another shopper claimed this one-of-one saree just before you. You have not been charged. If their checkout does not complete, it may become available again — or you can explore other sarees before they go.",
  removeProduct: true,
  title: "This saree is currently reserved",
} satisfies Omit<OneOfOneConflictCopy, "code">;

const unavailableCopy = {
  blockPayment: true,
  ctaHref: "/collection",
  ctaLabel: "Explore other sarees",
  message:
    "We’re sorry — this one-of-one piece is no longer available. You have not been charged. Please explore other sarees before they go.",
  removeProduct: true,
  title: "This piece is no longer available",
} satisfies Omit<OneOfOneConflictCopy, "code">;

export const oneOfOneConflictCopyByCode: Record<
  OneOfOneConflictCode,
  Omit<OneOfOneConflictCopy, "code">
> = {
  CHECKOUT_ATTEMPT_NOT_REUSABLE: {
    blockPayment: false,
    ctaLabel: "Try again",
    message:
      "Something interrupted checkout before payment began. You have not been charged. Please try again.",
    removeProduct: false,
    title: "We could not start checkout",
  },
  CHECKOUT_CART_CHANGED: {
    blockPayment: false,
    ctaLabel: "Try again",
    message:
      "Something interrupted checkout before payment began. You have not been charged. Please try again.",
    removeProduct: false,
    title: "We could not start checkout",
  },
  CHECKOUT_IN_PROGRESS: {
    blockPayment: false,
    ctaLabel: "Try again",
    message:
      "Your secure checkout is still being prepared. Please wait a moment and try again.",
    removeProduct: false,
    title: "We’re preparing your checkout",
  },
  GENERIC_CREATE_ORDER_FAILURE: {
    blockPayment: false,
    ctaLabel: "Try again",
    message:
      "Something interrupted checkout before payment began. You have not been charged. Please try again.",
    removeProduct: false,
    title: "We could not start checkout",
  },
  INVALID_PRODUCT_IDS: unavailableCopy,
  PRODUCT_RESERVED: reservedCopy,
  PRODUCT_SOLD: {
    blockPayment: true,
    ctaHref: "/collection",
    ctaLabel: "Explore other sarees",
    message:
      "This saree has just been bought by another customer. You have not been charged. We’re sorry — each From the Trunk piece is one-of-one, but there are more beautiful sarees waiting in the collection.",
    removeProduct: true,
    title: "This saree has just been bought",
  },
  PRODUCT_UNAVAILABLE: unavailableCopy,
  RESERVATION_CONFLICT: reservedCopy,
  RESERVATION_EXPIRED: unavailableCopy,
  TOO_MANY_PENDING_ORDERS: {
    blockPayment: false,
    ctaLabel: "Return to checkout",
    message:
      "You have a few pending checkout attempts. Please complete one or wait for them to expire before starting another.",
    removeProduct: false,
    title: "You already have pending checkouts",
  },
};

export function isOneOfOneConflictCode(
  code: null | string | undefined
): code is OneOfOneConflictCode {
  return Boolean(code && code in oneOfOneConflictCopyByCode);
}

export function getOneOfOneConflictCopy(
  code: null | string | undefined
): OneOfOneConflictCopy {
  const safeCode = isOneOfOneConflictCode(code)
    ? code
    : "GENERIC_CREATE_ORDER_FAILURE";
  return {
    code: safeCode,
    ...oneOfOneConflictCopyByCode[safeCode],
  };
}
