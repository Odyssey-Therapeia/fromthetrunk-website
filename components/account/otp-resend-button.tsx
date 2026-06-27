"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type OtpResendButtonProps = {
  resendAvailableAt: null | string;
  disabled?: boolean;
  isResending?: boolean;
  onResend: () => void;
};

const secondsUntil = (isoDate: null | string) => {
  if (!isoDate) return 0;
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
};

export function OtpResendButton({
  resendAvailableAt,
  disabled,
  isResending,
  onResend,
}: OtpResendButtonProps) {
  const [remaining, setRemaining] = useState(() => secondsUntil(resendAvailableAt));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRemaining(secondsUntil(resendAvailableAt));
    }, 0);
    const timer = window.setInterval(() => {
      setRemaining(secondsUntil(resendAvailableAt));
    }, 1000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [resendAvailableAt]);

  const isCoolingDown = remaining > 0;
  const label = useMemo(() => {
    if (isResending) return "Sending again...";
    if (isCoolingDown) return `Resend in ${remaining}s`;
    return "Resend OTP";
  }, [isCoolingDown, isResending, remaining]);

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-10 rounded-full px-4 text-ftt-burgundy/70 hover:bg-ftt-gold/10 hover:text-ftt-navy"
      disabled={disabled || isResending || isCoolingDown}
      onClick={onResend}
    >
      <RefreshCw data-icon="inline-start" />
      {label}
    </Button>
  );
}
