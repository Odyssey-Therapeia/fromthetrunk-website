"use client";

import { forwardRef } from "react";

import { BlouseSizeChartDialog } from "@/components/product/blouse-size-chart-dialog";
import {
  type BlouseSize,
  normalizeBlouseSize,
} from "@/lib/catalog/blouse-size-chart";
import { cn } from "@/lib/utils";

type BlouseSizeSelectorProps = {
  availableSizes: BlouseSize[];
  error?: null | string;
  onChange: (size: BlouseSize) => void;
  selectedSize?: null | string;
};

export const BlouseSizeSelector = forwardRef<
  HTMLDivElement,
  BlouseSizeSelectorProps
>(function BlouseSizeSelector(
  { availableSizes, error, onChange, selectedSize },
  ref,
) {
  const normalizedSelectedSize = normalizeBlouseSize(selectedSize);

  return (
    <section
      id="blouse-size-selector"
      ref={ref}
      aria-labelledby="blouse-size-heading"
      className="rounded-[1rem] border border-[#E7DDD4] bg-[#FFFCF8]/92 p-3 shadow-[0_10px_26px_rgba(20,29,70,0.05)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
            Blouse fit
          </p>
          <h2
            id="blouse-size-heading"
            className="mt-1 text-sm font-semibold text-[#141D46]"
          >
            Select your blouse size
          </h2>
        </div>
        <BlouseSizeChartDialog selectedSize={normalizedSelectedSize} />
      </div>

      <div
        className="mt-3 flex flex-wrap gap-2"
        role="radiogroup"
        aria-invalid={Boolean(error)}
        aria-label="Blouse size"
      >
        {availableSizes.map((size) => {
          const isSelected = normalizedSelectedSize === size;

          return (
            <button
              key={size}
              type="button"
              data-size-option
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(size)}
              className={cn(
                "min-h-11 min-w-14 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1]",
                isSelected
                  ? "border-[#B39152] bg-[#141D46] text-[#FDF7F1] shadow-[0_10px_24px_rgba(20,29,70,0.16)]"
                  : "border-[#E7DDD4] bg-[#FDF7F1] text-[#141D46] hover:border-[#B39152]/70 hover:bg-[#B39152]/8",
              )}
            >
              {size}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-[#601D1C]/16 bg-[#601D1C]/6 px-3 py-2 text-xs font-medium text-[#601D1C]">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[#141D46]/58">
          The selected size will be saved with your order and packing record.
        </p>
      )}
    </section>
  );
});
