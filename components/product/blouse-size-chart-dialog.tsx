"use client";

import { useState } from "react";
import Image from "next/image";
import { Ruler } from "lucide-react";

import { BlouseSizeChartTable } from "@/components/product/blouse-size-chart-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  normalizeBlouseSize,
  type BlouseSize,
  type MeasurementUnit,
} from "@/lib/catalog/blouse-size-chart";
import { cn } from "@/lib/utils";

type BlouseSizeChartDialogProps = {
  selectedSize?: null | string;
  triggerClassName?: string;
};

export function BlouseSizeChartDialog({
  selectedSize,
  triggerClassName,
}: BlouseSizeChartDialogProps) {
  const [unit, setUnit] = useState<MeasurementUnit>("in");
  const normalizedSelectedSize = normalizeBlouseSize(selectedSize);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 rounded-full border-[#B39152]/45 bg-[#FDF7F1] px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#601D1C] hover:bg-[#B39152]/10 hover:text-[#141D46]",
            triggerClassName,
          )}
        >
          <Ruler data-icon="inline-start" aria-hidden="true" />
          Size Chart
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] max-w-[min(960px,calc(100vw-1.5rem))] overflow-y-auto rounded-[1.5rem] border-[#E7DDD4] bg-[#FDF7F1] p-4 text-[#141D46] shadow-[0_24px_80px_rgba(20,29,70,0.22)] sm:p-6">
        <DialogHeader className="gap-2 text-left">
          <div className="inline-flex w-fit items-center rounded-full border border-[#B39152]/35 bg-[#B39152]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
            FTT fit guide
          </div>
          <DialogTitle className="font-serif text-3xl font-normal text-[#141D46]">
            Blouse Size Chart
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#601D1C]/68">
            Use over bust and under bust measurements for the closest fit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E7DDD4] bg-[#FFFCF8] p-3">
          <p className="text-xs leading-5 text-[#141D46]/66">
            Bra sizes can be unreliable for estimating blouse size. For best
            results, measure your over bust and under bust.
          </p>
          <div
            className="grid grid-cols-2 rounded-full border border-[#E7DDD4] bg-[#FDF7F1] p-1"
            aria-label="Measurement unit"
          >
            {(["in", "cm"] as MeasurementUnit[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={unit === option}
                onClick={() => setUnit(option)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  unit === option
                    ? "bg-[#141D46] text-[#FDF7F1]"
                    : "text-[#601D1C]/70 hover:text-[#141D46]",
                )}
              >
                {option === "in" ? "Inches" : "CM"}
              </button>
            ))}
          </div>
        </div>

        <BlouseSizeChartTable
          selectedSize={normalizedSelectedSize as BlouseSize | null}
          unit={unit}
        />

        <figure className="overflow-hidden rounded-2xl border border-[#E7DDD4] bg-[#FFFCF8] p-3">
          <Image
            src="/Blouse_size.png"
            alt="Blouse measurement guide showing over bust and under bust"
            width={1448}
            height={1086}
            sizes="(max-width: 768px) 92vw, 860px"
            className="h-auto w-full rounded-xl object-contain"
          />
          <figcaption className="mt-3 text-xs leading-5 text-[#601D1C]/60">
            Measure flat and close to the body. If you are between sizes, choose
            the more comfortable fit.
          </figcaption>
        </figure>
      </DialogContent>
    </Dialog>
  );
}
