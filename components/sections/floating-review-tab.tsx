"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const clampRating = (value: number) =>
  Math.min(5, Math.max(1, Math.round(value * 10) / 10));

export function FloatingReviewTab() {
  const [comment, setComment] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [rating, setRating] = useState(5);
  const [submitError, setSubmitError] = useState(false);
  const [website, setWebsite] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const startedAtRef = useRef(0);
  const ratingTrackProgress = ((rating - 1) / 4) * 100;

  const updateRating = (value: number) => {
    if (!Number.isFinite(value)) return;
    setRating(clampRating(value));
  };

  useEffect(() => {
    const updateVisibility = () => {
      const top = sentinelRef.current?.getBoundingClientRect().top;
      setIsVisible(
        typeof top === "number"
          ? top <= window.innerHeight * 0.72 ||
              window.scrollY > window.innerHeight * 0.4
          : window.scrollY > window.innerHeight * 0.4,
      );
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <span
        ref={sentinelRef}
        className="block h-px w-px"
        data-review-sentinel="true"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setIsSubmitted(false);
          setSubmitError(false);
          setWebsite("");
          startedAtRef.current = Date.now();
        }}
        aria-hidden={!isVisible}
        aria-label="Open review form"
        tabIndex={isVisible ? 0 : -1}
        className={`fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 border border-[#B39152]/50 bg-[#601D1C] px-3 py-5 text-[#FDF7F1] shadow-[0_18px_50px_rgba(96,29,28,0.28)] transition duration-500 hover:bg-[#0E0D0E] hover:text-[#B39152] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] md:flex ${
          isVisible
            ? "visible translate-x-0 opacity-100"
            : "invisible pointer-events-none translate-x-full opacity-0"
        }`}
      >
        <span
          className="[writing-mode:vertical-rl] text-[0.72rem] font-semibold uppercase tracking-[0.26em]"
          aria-hidden="true"
        >
          ★ Reviews
        </span>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/68 px-4 py-8 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-dialog-title"
            tabIndex={-1}
            className="relative w-full max-w-xl border border-[#B39152]/35 bg-[#FDF7F1] p-6 text-[#601D1C] shadow-[0_30px_100px_rgba(0,0,0,0.38)] outline-none md:p-9"
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close review form"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-[#601D1C]/12 text-[#601D1C] transition hover:border-[#B39152] hover:text-[#B39152] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>

            {isSubmitted ? (
              <div className="py-10 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#B39152]">
                  Thank You
                </p>
                <h2 className="mt-4 font-serif text-4xl leading-tight text-[#601D1C] md:text-5xl">
                  Thank you for sharing your story.
                </h2>
                <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-[#601D1C]/68">
                  Your note helps us understand how each restored saree begins
                  its next chapter.
                </p>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-8 rounded-full border border-[#B39152] bg-[#601D1C] px-7 py-3 text-sm font-semibold text-[#B39152] transition hover:-translate-y-0.5 hover:bg-[#0E0D0E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2"
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onFocusCapture={() => {
                  if (!startedAtRef.current) startedAtRef.current = Date.now();
                }}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (isSubmitting) return;

                  setIsSubmitting(true);
                  setSubmitError(false);

                  try {
                    const response = await fetch("/api/v2/site-feedback/submit", {
                      body: JSON.stringify({
                        clientSubmissionId:
                          typeof crypto !== "undefined" && "randomUUID" in crypto
                            ? crypto.randomUUID()
                            : undefined,
                        comment,
                        pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
                        rating,
                        startedAt: startedAtRef.current || undefined,
                        website,
                      }),
                      headers: { "Content-Type": "application/json" },
                      method: "POST",
                    });

                    if (!response.ok) {
                      throw new Error("Review submission failed.");
                    }

                    setComment("");
                    setRating(5);
                    setIsSubmitted(true);
                  } catch {
                    setSubmitError(true);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  name="website"
                  className="hidden"
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#B39152]">
                  Customer Review
                </p>
                <h2
                  id="review-dialog-title"
                  className="mt-4 max-w-md font-serif text-4xl leading-tight text-[#601D1C] md:text-5xl"
                >
                  Share your From The Trunk experience.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-[#601D1C]/68">
                  Tell us how the saree felt, where it travelled, or what made
                  the piece feel personal.
                </p>

                <div className="mt-8 border-y border-[#601D1C]/10 py-6">
                  <p className="text-center text-sm font-semibold text-[#601D1C]">
                    Your rating
                  </p>

                  {/* Centered stars with partial fill (e.g. 4.8 = 4 full + 80%). */}
                  <div
                    className="mt-4 flex items-center justify-center gap-1.5"
                    aria-hidden="true"
                  >
                    {[0, 1, 2, 3, 4].map((i) => {
                      const fill = Math.max(0, Math.min(1, rating - i)) * 100;
                      return (
                        <span
                          key={i}
                          className="relative text-4xl leading-none text-[#601D1C]/20"
                        >
                          ★
                          <span
                            className="absolute inset-0 overflow-hidden text-[#B39152]"
                            style={{ width: `${fill}%` }}
                          >
                            ★
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  <p className="mt-3 text-center font-serif text-3xl leading-none text-[#601D1C]">
                    {rating.toFixed(1)}
                    <span className="text-lg text-[#601D1C]/45"> / 5</span>
                  </p>

                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.1}
                    value={rating}
                    onInput={(event) =>
                      updateRating(event.currentTarget.valueAsNumber)
                    }
                    onChange={(event) =>
                      updateRating(event.currentTarget.valueAsNumber)
                    }
                    aria-label="Rating"
                    aria-valuetext={`${rating.toFixed(1)} out of 5`}
                    className="mt-5 block h-3 w-full cursor-pointer appearance-none rounded-full border border-[#601D1C]/20 outline-none transition focus-visible:ring-2 focus-visible:ring-[#B39152]/35 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#B39152] [&::-moz-range-thumb]:shadow-[0_5px_18px_rgba(96,29,28,0.22)] [&::-moz-range-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#B39152] [&::-webkit-slider-thumb]:shadow-[0_5px_18px_rgba(96,29,28,0.22)] [&::-webkit-slider-thumb]:active:cursor-grabbing"
                    style={{
                      background: `linear-gradient(to right, #B39152 0%, #B39152 ${ratingTrackProgress}%, #3A3A3A ${ratingTrackProgress}%, #3A3A3A 100%)`,
                    }}
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-[#601D1C]/40">
                    <span>1</span>
                    <span>5</span>
                  </div>
                </div>

                <label
                  htmlFor="review-comment"
                  className="mt-6 block text-sm font-semibold text-[#601D1C]"
                >
                  Your comment
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={5}
                  required
                  placeholder="Write your review here..."
                  className="mt-3 w-full resize-none border border-[#601D1C]/15 bg-white/70 px-4 py-3 text-sm leading-6 text-[#601D1C] outline-none transition placeholder:text-[#601D1C]/35 focus:border-[#B39152] focus:ring-2 focus:ring-[#B39152]/25"
                />
                <div aria-live="polite" className="mt-3 min-h-5">
                  {submitError ? (
                    <p className="text-sm leading-6 text-[#601D1C]">
                      We couldn’t save this right now. Please try again.
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#B39152] bg-[#601D1C] px-7 py-3 text-sm font-semibold text-[#B39152] transition hover:-translate-y-0.5 hover:bg-[#0E0D0E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {isSubmitting ? "Saving..." : "Submit Review"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-sm font-semibold text-[#601D1C]/58 transition hover:text-[#601D1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152]"
                  >
                    Maybe later
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
