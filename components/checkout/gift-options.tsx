import { Gift } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { CheckoutField } from "./checkout-field";

export const GIFT_MESSAGE_MAX = 300;

const checkboxClass =
  "border-ftt-navy data-[state=checked]:border-ftt-navy data-[state=checked]:bg-ftt-navy";

type GiftOptionsProps = {
  isGift: boolean;
  onGiftChange: (value: boolean) => void;
  includeMessage: boolean;
  onIncludeMessageChange: (value: boolean) => void;
  giftMessage: string;
  onGiftMessageChange: (value: string) => void;
  /** The sender's name, shown on the gift card (billing is collected earlier). */
  senderName: string;
  onSenderNameChange: (value: string) => void;
  disabled?: boolean;
};

/** "Gift this to someone" — your details (From) + an optional personalized note. */
export function GiftOptions({
  isGift,
  onGiftChange,
  includeMessage,
  onIncludeMessageChange,
  giftMessage,
  onGiftMessageChange,
  senderName,
  onSenderNameChange,
  disabled,
}: GiftOptionsProps) {
  return (
    <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-7">
      <label className="flex cursor-pointer items-start gap-4">
        <Checkbox
          checked={isGift}
          onCheckedChange={(value) => onGiftChange(value === true)}
          disabled={disabled}
          className={cn("mt-1", checkboxClass)}
        />
        <span className="flex-1">
          <span className="flex items-center gap-2">
            <Gift className="size-5 text-ftt-gold" />
            <span className="font-serif text-2xl text-ftt-navy">
              Gift this to someone
            </span>
          </span>
          <span className="mt-1 block text-sm leading-6 text-ftt-burgundy/65">
            We&apos;ll ship it straight to them with a keepsake presentation —
            add your name and a note for the gift card.
          </span>
        </span>
      </label>

      {isGift ? (
        <div className="mt-6 space-y-5 border-t border-ftt-border pt-6">
          <CheckoutField
            label="From — so they know it's from you"
            value={senderName}
            onChange={onSenderNameChange}
            disabled={disabled}
            placeholder="Your name"
            autoComplete="name"
          />

          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-ftt-burgundy/80">
              <Checkbox
                checked={includeMessage}
                onCheckedChange={(value) => onIncludeMessageChange(value === true)}
                disabled={disabled}
                className={checkboxClass}
              />
              Add a personalized message
            </label>
            {includeMessage ? (
              <div className="space-y-1">
                <Textarea
                  value={giftMessage}
                  onChange={(event) =>
                    onGiftMessageChange(
                      event.target.value.slice(0, GIFT_MESSAGE_MAX),
                    )
                  }
                  disabled={disabled}
                  rows={4}
                  placeholder="Write a little note for them — we'll hand-write it on an FTT card."
                  className="rounded-xl border-ftt-border bg-ftt-ivory text-ftt-navy focus-visible:ring-ftt-gold/25"
                />
                <p className="text-right text-[11px] text-ftt-burgundy/45">
                  {giftMessage.length}/{GIFT_MESSAGE_MAX}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
