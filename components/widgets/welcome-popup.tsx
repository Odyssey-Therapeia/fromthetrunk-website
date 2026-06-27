"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

const WELCOME_SEEN_KEY = "ftt-welcome-seen-v1";
const SHOW_AFTER_MS = 20000; // 20s of browsing
const SCROLL_THRESHOLD_PX = 200;

// Faint heritage mandala that bleeds from the card's corner.
const MANDALA =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none' stroke='%23A8854D' stroke-width='0.6'><circle cx='50' cy='50' r='46'/><circle cx='50' cy='50' r='34'/><circle cx='50' cy='50' r='22'/><g><path d='M50 4 L54 18 L50 30 L46 18 Z'/><path d='M50 96 L54 82 L50 70 L46 82 Z'/><path d='M4 50 L18 54 L30 50 L18 46 Z'/><path d='M96 50 L82 54 L70 50 L82 46 Z'/><path d='M18 18 L30 26 L34 34 L26 30 Z'/><path d='M82 82 L70 74 L66 66 L74 70 Z'/><path d='M82 18 L70 26 L66 34 L74 30 Z'/><path d='M18 82 L30 74 L34 66 L26 70 Z'/></g></svg>";

/**
 * Welcome modal — appears once, after ~20s of browsing AND the visitor has
 * scrolled. Dismissal is remembered in localStorage so it never returns.
 */
export function WelcomePopup() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  // Reveal trigger: 20s elapsed + a real scroll, whichever lands last.
  useEffect(() => {
    if (localStorage.getItem(WELCOME_SEEN_KEY)) return;

    let elapsed = false;
    let scrolled = window.scrollY > SCROLL_THRESHOLD_PX;
    let done = false;

    const reveal = () => {
      if (done || !elapsed || !scrolled) return;
      done = true;
      setOpen(true);
    };
    const onScroll = () => {
      if (window.scrollY > SCROLL_THRESHOLD_PX) scrolled = true;
      reveal();
    };
    const timer = window.setTimeout(() => {
      elapsed = true;
      reveal();
    }, SHOW_AFTER_MS);

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      try {
        localStorage.setItem(WELCOME_SEEN_KEY, "1");
      } catch {
        // private mode — non-fatal
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      // private mode — non-fatal
    }
  };

  const explore = () => {
    dismiss();
    router.push("/collection");
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ftt-welcome-heading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
          className="fixed inset-0 z-100 flex items-center justify-center p-6 print:hidden"
          style={{
            background: "rgba(16,10,8,.62)",
            backdropFilter: "blur(6px) saturate(105%)",
            WebkitBackdropFilter: "blur(6px) saturate(105%)",
          }}
        >
          <motion.div
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 14, scale: 0.975 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative flex h-[472px] w-[500px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] flex-col items-center justify-center overflow-hidden rounded-[14px] border px-[46px] pb-[34px] pt-[42px] text-center max-[540px]:h-auto max-[540px]:px-[30px] max-[540px]:pb-7 max-[540px]:pt-[38px]"
            style={{
              borderColor: "#C7AE82",
              background:
                "linear-gradient(180deg, #FCF7EF 0%, #FAF4EA 42%, #F7EFE0 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,.7) inset, 0 40px 90px -30px rgba(0,0,0,.7), 0 10px 30px -15px rgba(0,0,0,.5)",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-[70px] -right-[70px] size-[220px] bg-contain bg-no-repeat opacity-10"
              style={{ backgroundImage: `url("${MANDALA}")` }}
            />

            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-[14px] top-[14px] z-[2] grid size-[30px] place-items-center rounded-full text-[#6B5149] transition hover:rotate-90 hover:bg-[#A8854D]/12 hover:text-[#2A1714]"
            >
              <X className="size-[15px]" strokeWidth={1.6} />
            </button>

            <div className="relative z-[1] w-full">
              <p className="m-0 mb-4 font-sans text-[11px] uppercase tracking-[0.26em] text-[#A8854D]">
                Welcome to From The Trunk
              </p>

              <h2
                id="ftt-welcome-heading"
                className="m-0 mb-4 font-serif text-[39px] font-medium leading-[1.06] tracking-[0.005em] text-[#2A1714] max-[540px]:text-[33px]"
              >
                Every saree has
                <br />a <em className="font-semibold italic">past life</em>.
              </h2>

              <p className="mx-auto m-0 max-w-[34ch] font-serif text-[16.5px] leading-[1.5] text-[#6B5149]">
                Each one authenticated, restored by hand, and ready for its next
                chapter&nbsp;— yours.
              </p>

              <div
                aria-hidden
                className="mx-auto mb-[22px] mt-6 flex w-[78%] items-center justify-center gap-[14px]"
              >
                <span
                  className="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, #C7AE82 55%, #C7AE82)",
                  }}
                />
                <span
                  className="size-[7px] rotate-45 bg-[#A8854D]"
                  style={{ boxShadow: "0 0 0 3px rgba(168,133,77,.15)" }}
                />
                <span
                  className="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(270deg, transparent, #C7AE82 55%, #C7AE82)",
                  }}
                />
              </div>

              <p className="m-0 mb-[7px] font-sans text-[10.5px] font-medium uppercase tracking-[0.24em] text-[#A8854D]">
                Grand Launch Week
              </p>
              <p className="mx-auto m-0 mb-[22px] max-w-[30ch] font-serif text-[16px] leading-[1.45] text-[#2A1714]">
                Limited <b className="font-semibold">fortnightly drops</b> —
                reserve your piece early.
              </p>

              <button
                type="button"
                onClick={explore}
                className="group inline-flex w-full items-center justify-center gap-[10px] rounded-[7px] bg-[#15233F] px-[22px] py-[14px] font-sans text-[12.5px] font-medium uppercase tracking-[0.16em] text-[#FAF4EA] transition hover:-translate-y-px hover:bg-[#1E3157]"
                style={{ boxShadow: "0 10px 24px -12px rgba(21,35,63,.7)" }}
              >
                Explore the collection
                <ArrowRight
                  className="size-4 transition group-hover:translate-x-1"
                  strokeWidth={1.7}
                />
              </button>

              <button
                type="button"
                onClick={dismiss}
                className="group mt-[14px] px-1.5 py-1 font-sans text-[12.5px] font-light tracking-[0.06em] text-[#6B5149] transition hover:text-[#2A1714]"
              >
                <span className="border-b border-transparent pb-px transition group-hover:border-[#C7AE82]">
                  Maybe later
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
