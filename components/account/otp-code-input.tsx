"use client";

import type React from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  inputRef,
}: OtpCodeInputProps) {
  const applyCode = (next: string) => {
    const code = next.replace(/\D/g, "").slice(0, 6);
    onChange(code);
    if (code.length === 6) onComplete?.(code);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const code = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!code) return;

    event.preventDefault();
    event.stopPropagation();
    applyCode(code);
  };

  return (
    <div className="w-full" onPasteCapture={handlePaste}>
      <InputOTP
        ref={inputRef}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        value={value}
        onChange={applyCode}
        onComplete={applyCode}
        onPaste={handlePaste}
        disabled={disabled}
        containerClassName="w-full justify-center gap-2"
        aria-invalid={invalid}
      >
        <InputOTPGroup className="w-full justify-center gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              aria-invalid={invalid}
              className={cn(
                "h-12 flex-1 rounded-xl border bg-ftt-card text-base font-semibold text-ftt-navy shadow-[0_8px_24px_rgba(20,29,70,0.06)] first:rounded-xl first:border-l last:rounded-xl sm:h-14 sm:max-w-12",
                "border-ftt-border focus-visible:ring-ftt-gold/30",
                invalid && "border-ftt-burgundy text-ftt-burgundy ring-1 ring-ftt-burgundy/25",
              )}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
