"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  buildContactSubmitPayload,
  CONTACT_MESSAGE_MAX,
  CONTACT_NAME_MAX,
  CONTACT_PHONE_MAX,
  CONTACT_TOPIC_OPTIONS,
  CONTACT_WIZARD_STEPS,
  emptyContactWizardState,
  isContactStepValid,
  sanitizePhone,
  type ContactWizardState,
} from "@/lib/contact/contact-form";
import { cn } from "@/lib/utils";

export type ContactWizardProps = {
  surface: "dialog" | "landing";
  defaultTopic?: string;
  onSuccess?: () => void;
  className?: string;
};

const STEP_QUESTIONS = [
  "What brings you to From the Trunk?",
  "What should we call you?",
  "Where should we send our reply?",
  "Would you like to add a phone number?",
  "Tell us a little more.",
  "Review & send",
] as const;

const fieldClass =
  "h-12 w-full rounded-2xl border border-[#601D1C]/15 bg-[#FFFCF8] px-4 text-sm text-[#141D46] outline-none transition placeholder:text-[#601D1C]/35 focus:border-[#B39152] focus:ring-2 focus:ring-[#B39152]/20";

const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-[#601D1C]/65";

function QuestionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-serif text-2xl leading-tight text-[#141D46]">
      {children}
    </h3>
  );
}

export function ContactWizard({
  surface,
  defaultTopic = "",
  onSuccess,
  className,
}: ContactWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ContactWizardState>(() =>
    emptyContactWizardState(defaultTopic),
  );
  const [status, setStatus] = useState<"error" | "idle" | "success">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startedAtRef = useRef(0);
  const clientIdRef = useRef<string | undefined>(undefined);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Wizard mounts when the dialog opens / the landing section renders → this
    // starts the anti-spam dwell clock and mints a dedupe id.
    startedAtRef.current = Date.now();
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      clientIdRef.current = crypto.randomUUID();
    }
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  const patch = (next: Partial<ContactWizardState>) =>
    setState((prev) => ({ ...prev, ...next }));

  const isLast = step === CONTACT_WIZARD_STEPS - 1;
  const stepValid = isContactStepValid(step, state);

  const goNext = () => {
    if (!stepValid || isLast) return;
    setStatus("idle");
    setStep((s) => Math.min(s + 1, CONTACT_WIZARD_STEPS - 1));
  };

  const goPrev = () => {
    setStatus("idle");
    setStep((s) => Math.max(s - 1, 0));
  };

  const resetWizard = () => {
    setState(emptyContactWizardState(defaultTopic));
    setStatus("idle");
    setStep(0);
    startedAtRef.current = Date.now();
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      clientIdRef.current = crypto.randomUUID();
    }
  };

  const doSubmit = async () => {
    if (isSubmitting || !stepValid) return;
    setIsSubmitting(true);
    setStatus("idle");
    try {
      const pagePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const payload = buildContactSubmitPayload(state, {
        clientSubmissionId: clientIdRef.current,
        pagePath,
        startedAt: startedAtRef.current || undefined,
      });
      const response = await fetch("/api/v2/contact/submit", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Contact submission failed.");
      setStatus("success");
      if (onSuccess) {
        successTimerRef.current = window.setTimeout(() => onSuccess(), 1600);
      }
    } catch {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single form: Enter submits → advances on intermediate steps, sends on the
  // last. Textarea keeps native Enter (newline), so message never auto-advances.
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "success") return;
    if (isLast) {
      void doSubmit();
    } else {
      goNext();
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div
        className={cn("grid gap-4 text-center", className)}
        aria-live="polite"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#141D46] text-[#FDF7F1]">
          <Check className="size-6" aria-hidden="true" />
        </span>
        <p className="font-serif text-2xl leading-tight text-[#141D46]">
          Thank you for reaching out.
        </p>
        <p className="text-sm leading-6 text-[#601D1C]/75">
          We&rsquo;ve received your request. Our team will contact you shortly.
        </p>
        {surface === "landing" ? (
          <button
            type="button"
            onClick={resetWizard}
            className="mx-auto mt-1 rounded-full border border-[#B39152]/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#141D46] transition hover:bg-[#B39152]/10"
          >
            Send another message
          </button>
        ) : null}
      </div>
    );
  }

  const progressPct = ((step + 1) / CONTACT_WIZARD_STEPS) * 100;

  return (
    <form
      onSubmit={handleFormSubmit}
      onFocusCapture={() => {
        if (!startedAtRef.current) startedAtRef.current = Date.now();
      }}
      className={cn("grid gap-5", className)}
    >
      {/* Honeypot — hidden from humans + a11y tree. */}
      <input
        tabIndex={-1}
        autoComplete="off"
        value={state.website}
        onChange={(event) => patch({ website: event.target.value })}
        name="website"
        className="hidden"
        aria-hidden="true"
      />

      {/* Progress */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-[#601D1C]/55">
          <span>
            Step {step + 1} of {CONTACT_WIZARD_STEPS}
          </span>
          <span className="text-[#B39152]">{STEP_QUESTIONS[step]}</span>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-[#601D1C]/10"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={CONTACT_WIZARD_STEPS}
          aria-valuenow={step + 1}
          aria-label={`Contact form progress: step ${step + 1} of ${CONTACT_WIZARD_STEPS}`}
        >
          <div
            className="h-full rounded-full bg-[#B39152] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step body */}
      <div className="min-h-[9.5rem]">
        {step === 0 ? (
          <fieldset className="grid gap-3">
            <legend className="mb-1">
              <QuestionHeading>{STEP_QUESTIONS[0]}</QuestionHeading>
            </legend>
            <div
              role="radiogroup"
              aria-label={STEP_QUESTIONS[0]}
              className="grid gap-2.5 sm:grid-cols-2"
            >
              {CONTACT_TOPIC_OPTIONS.map((option) => {
                const selected = state.topic === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patch({ topic: option.value })}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm transition",
                      selected
                        ? "border-[#B39152] bg-[#B39152]/10 text-[#141D46] ring-1 ring-[#B39152]/40"
                        : "border-[#601D1C]/15 bg-[#FFFCF8] text-[#141D46]/80 hover:border-[#B39152]/50",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full border",
                        selected
                          ? "border-[#B39152] bg-[#B39152] text-[#FDF7F1]"
                          : "border-[#601D1C]/25",
                      )}
                      aria-hidden="true"
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <label className="grid gap-2">
            <QuestionHeading>{STEP_QUESTIONS[1]}</QuestionHeading>
            <span className={labelClass}>Name</span>
            <input
              value={state.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Your name"
              autoFocus
              maxLength={CONTACT_NAME_MAX}
              autoComplete="name"
              className={fieldClass}
            />
          </label>
        ) : null}

        {step === 2 ? (
          <label className="grid gap-2">
            <QuestionHeading>{STEP_QUESTIONS[2]}</QuestionHeading>
            <span className={labelClass}>Email</span>
            <input
              type="email"
              inputMode="email"
              value={state.email}
              onChange={(event) => patch({ email: event.target.value })}
              placeholder="you@example.com"
              autoFocus
              autoComplete="email"
              className={fieldClass}
            />
          </label>
        ) : null}

        {step === 3 ? (
          <label className="grid gap-2">
            <QuestionHeading>{STEP_QUESTIONS[3]}</QuestionHeading>
            <span className={labelClass}>Phone (optional)</span>
            <input
              type="tel"
              inputMode="tel"
              value={state.phone}
              onChange={(event) => patch({ phone: sanitizePhone(event.target.value) })}
              placeholder="+91 …"
              autoFocus
              autoComplete="tel"
              maxLength={CONTACT_PHONE_MAX}
              className={fieldClass}
            />
            <span className="text-xs text-[#601D1C]/55">
              You can skip this — email is enough.
            </span>
          </label>
        ) : null}

        {step === 4 ? (
          <label className="grid gap-2">
            <QuestionHeading>{STEP_QUESTIONS[4]}</QuestionHeading>
            <span className={labelClass}>Message</span>
            <textarea
              value={state.message}
              onChange={(event) => patch({ message: event.target.value })}
              placeholder="Tell us what you are looking for…"
              rows={4}
              autoFocus
              maxLength={CONTACT_MESSAGE_MAX}
              className={`${fieldClass} h-auto resize-none py-3`}
            />
            <span className="justify-self-end text-[11px] text-[#601D1C]/45">
              {state.message.trim().length}/{CONTACT_MESSAGE_MAX}
            </span>
          </label>
        ) : null}

        {step === 5 ? (
          <div className="grid gap-3">
            <QuestionHeading>{STEP_QUESTIONS[5]}</QuestionHeading>
            <dl className="grid gap-2 rounded-2xl border border-[#601D1C]/12 bg-[#FFFCF8] p-4 text-sm">
              {[
                ["Topic", state.topic],
                ["Name", state.name.trim()],
                ["Email", state.email.trim()],
                ...(state.phone.trim() ? [["Phone", state.phone.trim()]] : []),
              ].map(([term, value]) => (
                <div key={term} className="flex gap-3">
                  <dt className={`${labelClass} w-16 shrink-0 pt-0.5`}>{term}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[#141D46]">
                    {value}
                  </dd>
                </div>
              ))}
              <div className="flex gap-3">
                <dt className={`${labelClass} w-16 shrink-0 pt-0.5`}>Message</dt>
                <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[#141D46]/85">
                  {state.message.trim()}
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-5 text-[#601D1C]/60">
              We&rsquo;ll only use these details to respond to your request.
            </p>
          </div>
        ) : null}
      </div>

      {/* Status */}
      <div aria-live="polite" className="min-h-5">
        {status === "error" ? (
          <p className="text-sm leading-6 text-[#601D1C]">
            We couldn&rsquo;t send this right now. Please try again.
          </p>
        ) : null}
      </div>

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {step > 0 ? (
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#601D1C]/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#141D46] transition hover:border-[#B39152] hover:text-[#601D1C]"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </button>
        ) : (
          <span className="hidden sm:block" />
        )}

        {isLast ? (
          <button
            type="submit"
            disabled={!stepValid || isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#141D46] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] transition hover:bg-[#0E0D0E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isSubmitting ? "Sending…" : "Send request"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!stepValid}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#141D46] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] transition hover:bg-[#0E0D0E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}
