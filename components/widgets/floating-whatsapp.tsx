"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";

import { DEFAULT_WHATSAPP_MESSAGE, whatsappLink } from "@/lib/config/site";
import { cn } from "@/lib/utils";

const BUBBLE_DISMISSED_KEY = "ftt-wa-bubble-dismissed";

/** WhatsApp logo glyph (lucide has no brand icons). */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-7">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.157 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.512 5.26l-.999 3.648 3.736-.979zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

/**
 * Draggable floating WhatsApp button. Defaults above the mobile add-to-bag bar
 * (so it never overlaps it), and can be dragged anywhere on screen; a tap still
 * opens WhatsApp. The bubble appears once per session.
 */
export function FloatingWhatsApp() {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [showBubble, setShowBubble] = useState(false);
  const mobileReadingPage =
    pathname === "/founders" ||
    pathname === "/our-team" ||
    pathname === "/our-story" ||
    pathname.startsWith("/policies") ||
    pathname.endsWith("-policy") ||
    pathname === "/terms-of-service";
  const commerceOrAuthPage =
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/collection/");
  const suppressAutoBubble = mobileReadingPage || commerceOrAuthPage;

  useEffect(() => {
    if (suppressAutoBubble) return;
    if (sessionStorage.getItem(BUBBLE_DISMISSED_KEY)) return;
    const timer = window.setTimeout(() => setShowBubble(true), 2500);
    return () => window.clearTimeout(timer);
  }, [suppressAutoBubble]);

  const dismissBubble = () => {
    setShowBubble(false);
    try {
      sessionStorage.setItem(BUBBLE_DISMISSED_KEY, "1");
    } catch {
      // sessionStorage can throw in private mode — non-fatal.
    }
  };

  return (
    // Full-viewport drag boundary; pointer-events-none so it never blocks the page.
    <div
      ref={constraintsRef}
      className={cn(
        "pointer-events-none fixed inset-0 z-60 print:hidden",
        mobileReadingPage && "max-lg:hidden",
      )}
    >
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.04}
        dragMomentum={false}
        onDragStart={() => {
          draggingRef.current = true;
        }}
        onDragEnd={() => {
          // Keep the flag set through the trailing click, then clear it.
          window.setTimeout(() => {
            draggingRef.current = false;
          }, 0);
        }}
        className={cn(
          "pointer-events-auto absolute right-4 flex touch-none cursor-grab flex-col items-end gap-3 active:cursor-grabbing sm:right-6",
          commerceOrAuthPage ? "bottom-5 sm:bottom-6" : "bottom-24 sm:bottom-6",
        )}
      >
        {showBubble && !suppressAutoBubble ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative max-w-60 rounded-2xl rounded-br-sm border border-ftt-border bg-ftt-card px-4 py-3 shadow-[var(--ftt-soft-shadow)]"
          >
            <button
              type="button"
              onClick={dismissBubble}
              aria-label="Dismiss message"
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-ftt-border bg-ftt-ivory text-ftt-burgundy transition hover:text-ftt-burgundy"
            >
              <X className="size-3" />
            </button>
            <p className="font-serif text-base leading-tight text-ftt-navy">
              Hey, I&apos;m here to help 👋
            </p>
            <p className="mt-0.5 text-xs text-ftt-burgundy">
              Chat with us on WhatsApp.
            </p>
          </motion.div>
        ) : null}

        <motion.a
          href={whatsappLink(DEFAULT_WHATSAPP_MESSAGE)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          draggable={false}
          onClick={(event) => {
            // Suppress the click that fires at the end of a drag.
            if (draggingRef.current) {
              event.preventDefault();
              return;
            }
            dismissBubble();
          }}
          animate={reduceMotion ? undefined : { rotate: [0, -12, 12, -8, 8, 0] }}
          transition={
            reduceMotion
              ? undefined
              : {
                  duration: 0.6,
                  repeat: Infinity,
                  repeatDelay: 3.5,
                  ease: "easeInOut",
                }
          }
          whileHover={{ scale: 1.06, rotate: 0 }}
          whileTap={{ scale: 0.94 }}
          className="grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 ring-4 ring-[#25D366]/15"
        >
          <WhatsAppGlyph />
        </motion.a>
      </motion.div>
    </div>
  );
}
