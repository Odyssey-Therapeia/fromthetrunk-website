import { Button } from "@/components/ui/button";

type CheckoutStepActionsProps = {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  disabledPrimary?: boolean;
};

/** The back / continue control row shared by every checkout step. */
export function CheckoutStepActions({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  disabledPrimary,
}: CheckoutStepActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      {secondaryLabel && onSecondary ? (
        <Button
          type="button"
          variant="outline"
          onClick={onSecondary}
          className="rounded-full border-ftt-gold/45 bg-transparent text-ftt-burgundy hover:bg-ftt-gold/10 hover:text-ftt-burgundy"
        >
          {secondaryLabel}
        </Button>
      ) : null}

      <Button
        type="button"
        onClick={onPrimary}
        disabled={disabledPrimary}
        className="rounded-full bg-ftt-navy px-7 text-ftt-ivory hover:bg-ftt-midnight"
      >
        {primaryLabel}
      </Button>
    </div>
  );
}
