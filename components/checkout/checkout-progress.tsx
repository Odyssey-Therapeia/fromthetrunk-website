import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { CHECKOUT_STEPS, type CheckoutStep } from "@/lib/checkout/steps";

/** Completed "Account" links to the account page; checkout steps navigate in-flow. */
const ACCOUNT_HREF = "/account/profile";

type CheckoutProgressProps = {
  currentStep: CheckoutStep;
  onStepChange: (step: CheckoutStep) => void;
};

/**
 * Connected "journey" stepper: numbered nodes joined by a line that fills gold
 * up to the active step. Completed nodes show a check and stay clickable-back.
 */
export function CheckoutProgress({
  currentStep,
  onStepChange,
}: CheckoutProgressProps) {
  const stepIndex = CHECKOUT_STEPS.findIndex((step) => step.id === currentStep);
  const activeIndex = stepIndex === -1 ? 1 : stepIndex;
  const lastIndex = CHECKOUT_STEPS.length - 1;
  const fillFraction = activeIndex / lastIndex;

  return (
    <div className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
            Booking progress
          </p>
          <h2 className="mt-1 font-serif text-2xl text-ftt-navy">
            {CHECKOUT_STEPS[activeIndex]?.label}
          </h2>
        </div>
        <p className="text-xs font-medium text-ftt-burgundy/60">
          Step {activeIndex + 1} of {CHECKOUT_STEPS.length}
        </p>
      </div>

      <div className="relative flex justify-between">
        {/* connector track + gold fill, centred on the 36px nodes */}
        <div className="absolute inset-x-8 top-[18px] h-0.5 rounded-full bg-ftt-border" />
        <div
          className="absolute left-8 top-[18px] h-0.5 rounded-full bg-ftt-gold transition-all duration-500"
          style={{ width: `calc((100% - 4rem) * ${fillFraction})` }}
        />

        {CHECKOUT_STEPS.map((step, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          const isAccount = step.id === "account";
          // Account is clickable once complete (links out); checkout steps are
          // clickable to step back once complete.
          const navigable = complete;

          const circleClass = cn(
            "grid size-9 place-items-center rounded-full font-serif text-sm transition",
            complete && "bg-ftt-gold text-ftt-midnight",
            active &&
              "bg-ftt-navy text-ftt-ivory ring-2 ring-ftt-gold ring-offset-2 ring-offset-ftt-card",
            !complete &&
              !active &&
              "border border-ftt-border bg-ftt-ivory text-ftt-burgundy/40",
            navigable && "cursor-pointer hover:ring-2 hover:ring-ftt-gold/50",
          );
          const circleContent = complete ? (
            <Check className="size-4" />
          ) : (
            index + 1
          );

          return (
            <div
              key={step.id}
              className="relative z-10 flex w-16 flex-col items-center gap-2"
            >
              {isAccount && complete ? (
                <Link
                  href={ACCOUNT_HREF}
                  className={circleClass}
                  aria-label="Go to your account"
                >
                  {circleContent}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={!navigable}
                  onClick={() => {
                    if (navigable && step.id !== "account") {
                      onStepChange(step.id);
                    }
                  }}
                  className={circleClass}
                  aria-current={active ? "step" : undefined}
                >
                  {circleContent}
                </button>
              )}
              <span
                className={cn(
                  "text-center text-[8px] font-semibold uppercase leading-tight tracking-[0.1em] sm:text-[9px]",
                  active
                    ? "text-ftt-navy"
                    : complete
                      ? "text-ftt-burgundy/70"
                      : "text-ftt-burgundy/40",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
