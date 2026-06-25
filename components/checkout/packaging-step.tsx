import { Check } from "lucide-react";

import { PackagingPreview } from "@/components/checkout/packaging-preview";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SHIPPING_TIERS, type ShippingMethod } from "@/lib/config/order-pricing";
import { isFreeShipping } from "@/lib/checkout/estimate";
import { STEP_COPY } from "@/lib/checkout/steps";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

// Normal Care Packaging photo set (public/packaging/normalpkg-*.png).
const NORMAL_PACKAGING_IMAGES = [
  "/packaging/normalpkg-1.png",
  "/packaging/normalpkg-2.png",
  "/packaging/normalpkg-3.png",
  "/packaging/normalpkg-4.png",
  "/packaging/normalpkg-5.png",
];

// Premium Trunk Packaging — TODO: add public/packaging/premiumpkg-*.png once the
// premium shots are ready and list them here. For now it reuses the normal set
// so the preview carousel is functional.
const PREMIUM_PACKAGING_IMAGES = NORMAL_PACKAGING_IMAGES;

type PackagingOption = {
  id: ShippingMethod;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  images: string[];
};

const PACKAGING_OPTIONS: PackagingOption[] = [
  {
    id: "standard",
    title: "Normal Care Packaging",
    subtitle: "Securely packed for safe delivery",
    description:
      "Protective wrapping, a verified order note, and standard dispatch handling.",
    badge: "Recommended",
    images: NORMAL_PACKAGING_IMAGES,
  },
  {
    id: "express",
    title: "Premium Trunk Packaging",
    subtitle: "Gift-ready, archival-feeling presentation",
    description:
      "Premium outer box, tissue wrap, a care card, and priority handling for special occasions.",
    badge: "FTT Signature",
    images: PREMIUM_PACKAGING_IMAGES,
  },
];

type PackagingStepProps = {
  shippingMethod: ShippingMethod;
  onChange: (method: ShippingMethod) => void;
  effectiveSubtotal: number;
};

/**
 * Packaging & delivery selection. Reuses the existing standard / express
 * shipping tiers, presented as FTT packaging tiers. The selected Premium card
 * flips to a midnight surface — like opening a trunk. Each card has a "Preview
 * packaging" button that opens a carousel of the bag/box photos.
 */
export function PackagingStep({
  shippingMethod,
  onChange,
  effectiveSubtotal,
}: PackagingStepProps) {
  const free = isFreeShipping(effectiveSubtotal);

  return (
    <section className="rounded-3xl border border-ftt-border bg-ftt-card p-5 shadow-[var(--ftt-soft-shadow)] sm:p-7">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ftt-gold">
          {STEP_COPY.packaging.eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-2xl leading-tight text-ftt-navy sm:text-3xl">
          {STEP_COPY.packaging.heading}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ftt-burgundy/65">
          Both options are secure. Premium Trunk Packaging is for gifting,
          ceremonies, and keepsake presentation.
        </p>
      </header>

      <RadioGroup
        value={shippingMethod}
        onValueChange={(value) => onChange(value as ShippingMethod)}
        className="grid gap-3 md:grid-cols-2"
      >
        {PACKAGING_OPTIONS.map((option) => {
          const selected = shippingMethod === option.id;
          const price = free
            ? "Complimentary"
            : formatCurrency(SHIPPING_TIERS[option.id]);

          return (
            <div key={option.id} className="flex flex-col gap-2">
              <label
                htmlFor={`packaging-${option.id}`}
                className={cn(
                  "cursor-pointer rounded-3xl border p-5 transition",
                  selected
                    ? "border-ftt-gold bg-ftt-midnight text-ftt-ivory shadow-[0_16px_40px_rgba(20,29,70,0.16)]"
                    : "border-ftt-border bg-ftt-ivory text-ftt-navy hover:border-ftt-gold/65",
                )}
              >
                <RadioGroupItem
                  id={`packaging-${option.id}`}
                  value={option.id}
                  className="sr-only"
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em]",
                      selected
                        ? "bg-ftt-gold/20 text-ftt-gold"
                        : "bg-ftt-gold/12 text-ftt-burgundy",
                    )}
                  >
                    {option.badge}
                  </span>
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full border text-xs transition",
                      selected
                        ? "border-ftt-gold bg-ftt-gold text-ftt-midnight"
                        : "border-ftt-border bg-ftt-card text-transparent",
                    )}
                    aria-hidden
                  >
                    <Check className="size-3.5" />
                  </span>
                </div>

                <h3 className="mt-4 font-serif text-2xl leading-tight">
                  {option.title}
                </h3>
                <p
                  className={cn(
                    "mt-1 text-sm font-medium",
                    selected ? "text-ftt-ivory/75" : "text-ftt-burgundy/60",
                  )}
                >
                  {option.subtitle}
                </p>
                <p
                  className={cn(
                    "mt-4 text-sm leading-6",
                    selected ? "text-ftt-ivory/70" : "text-ftt-burgundy/65",
                  )}
                >
                  {option.description}
                </p>
                <p
                  className={cn(
                    "mt-5 text-sm font-semibold",
                    selected ? "text-ftt-gold" : "text-ftt-navy",
                  )}
                >
                  {price}
                </p>
              </label>

              <PackagingPreview
                title={option.title}
                subtitle={option.subtitle}
                description={option.description}
                price={price}
                images={option.images}
              />
            </div>
          );
        })}
      </RadioGroup>
    </section>
  );
}
