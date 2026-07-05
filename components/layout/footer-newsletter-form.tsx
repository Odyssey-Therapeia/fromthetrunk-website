"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

// Simple, permissive email shape check — the server does the authoritative
// validation. This only drives the ✦ → arrow affordance and submit gating.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * variant "footer" — dark surface (default, sits on the navy footer).
 * variant "light" — ivory surface (e.g. the welcome popup).
 */
export function FooterNewsletterForm({
  variant = "footer",
}: {
  variant?: "footer" | "light";
} = {}) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const isValid = EMAIL_PATTERN.test(email.trim());
  const isLight = variant === "light";
  const fieldId = isLight ? "welcome-newsletter-email" : "footer-email";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid || isLoading || subscribed) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/v2/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        requiresEmailConfirmation?: boolean;
      };

      if (!response.ok) {
        toast.error(data.message || "Unable to subscribe. Please try again.");
        return;
      }

      setSubscribed(true);
      toast.success(
        data.message ||
          (data.requiresEmailConfirmation
            ? "Check your email to confirm your subscription."
            : "You're subscribed to private drops."),
      );
    } catch {
      toast.error("Unable to subscribe. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex min-h-11 overflow-hidden rounded-full border",
        isLight
          ? "border-[#C7AE82] bg-white/70"
          : "border-[#B39152]/50 bg-[#070A17]/22",
      )}
    >
      <label htmlFor={fieldId} className="sr-only">
        Email address
      </label>
      <input
        id={fieldId}
        name="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={subscribed}
        placeholder="Enter your email"
        className={cn(
          "min-w-0 flex-1 bg-transparent px-5 text-sm outline-none disabled:opacity-70",
          isLight
            ? "text-[#2A1714] placeholder:text-[#6B5149]/50"
            : "text-[#FDF7F1] placeholder:text-[#FDF7F1]/42",
        )}
      />
      <button
        type="submit"
        disabled={!isValid || isLoading || subscribed}
        className={cn(
          "grid w-11 place-items-center transition disabled:cursor-not-allowed disabled:hover:bg-transparent",
          isLight
            ? "text-[#A8854D] hover:bg-[#A8854D]/10 hover:text-[#2A1714]"
            : "text-[#B39152] hover:bg-[#B39152]/10 hover:text-[#FDF7F1]",
        )}
        aria-label={isValid ? "Submit email" : "Enter a valid email to subscribe"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : subscribed ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : isValid ? (
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">✦</span>
        )}
      </button>
    </form>
  );
}
