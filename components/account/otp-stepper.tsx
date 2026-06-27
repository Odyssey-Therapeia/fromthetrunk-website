"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type OtpStepperProps = {
  steps: string[];
  currentStep: number;
};

export function OtpStepper({ steps, currentStep }: OtpStepperProps) {
  const progress =
    steps.length <= 1 ? 100 : Math.round((currentStep / (steps.length - 1)) * 100);

  return (
    <div className="rounded-[1.25rem] border border-ftt-border bg-ftt-card p-4 shadow-[0_12px_34px_rgba(20,29,70,0.07)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge className="rounded-full border border-ftt-gold/35 bg-ftt-gold/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-ftt-gold">
          Account setup
        </Badge>
        <span className="text-xs font-medium text-ftt-burgundy/55">
          {currentStep + 1} of {steps.length}
        </span>
      </div>

      <Progress
        value={progress}
        className="h-1.5 bg-ftt-gold/18 [&>div]:bg-ftt-gold"
      />

      <ol className="mt-4 grid grid-cols-4 gap-2">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isActive = index === currentStep;

          return (
            <li key={step} className="flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border text-[11px] font-semibold transition",
                  isComplete || isActive
                    ? "border-ftt-gold bg-ftt-navy text-ftt-ivory"
                    : "border-ftt-border bg-ftt-ivory text-ftt-burgundy/45",
                )}
              >
                {isComplete ? <Check data-icon="inline-start" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.12em]",
                  isActive ? "text-ftt-navy" : "text-ftt-burgundy/45",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
