/**
 * Checkout step model shared by the orchestrator and the progress stepper.
 *
 * `account` is shown in the stepper as already-complete (the route is gated, so
 * the customer is signed in by the time they arrive) but is never an active
 * step — the active steps are shipping → billing → packaging → review.
 */

export type CheckoutStep = "shipping" | "billing" | "packaging" | "review";

export type CheckoutStepMeta = {
  id: "account" | CheckoutStep;
  label: string;
};

export const CHECKOUT_STEPS: CheckoutStepMeta[] = [
  { id: "account", label: "Account" },
  { id: "shipping", label: "Shipping" },
  { id: "billing", label: "Billing" },
  { id: "packaging", label: "Packaging" },
  { id: "review", label: "Review & Pay" },
];

export const STEP_COPY: Record<
  CheckoutStep,
  { eyebrow: string; heading: string; description: string }
> = {
  shipping: {
    eyebrow: "Shipping",
    heading: "Where should this piece continue its story?",
    description: "Choose a saved address or add a new delivery address.",
  },
  billing: {
    eyebrow: "Billing",
    heading: "Invoice details",
    description:
      "Use the same address, or add a separate billing address for payment records.",
  },
  packaging: {
    eyebrow: "Packaging & gifting",
    heading: "Choose how your saree arrives.",
    description:
      "Normal Care Packaging is secure and simple. Premium Trunk Packaging is gift-ready and archival.",
  },
  review: {
    eyebrow: "Final review",
    heading: "Confirm your trunk booking.",
    description:
      "Review your selected piece, address, packaging, and total before Razorpay opens.",
  },
};
