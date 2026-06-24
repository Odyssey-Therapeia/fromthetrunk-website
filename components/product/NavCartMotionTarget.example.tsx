"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Optional example. If you already have a cart icon in the nav, you only need:
 *   data-ftt-cart-target
 * on the clickable cart element, and:
 *   data-ftt-cart-count
 * on the count badge.
 */
export function NavCartMotionTarget({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ quantity?: number }>).detail;
      setCount((current) => current + (detail?.quantity ?? 1));
    };

    window.addEventListener("ftt:cart-updated", handler);
    return () => window.removeEventListener("ftt:cart-updated", handler);
  }, []);

  return (
    <Link
      href="/cart"
      data-ftt-cart-target
      aria-label={`Open bag, ${count} items`}
      className="relative grid h-10 w-10 place-items-center rounded-full text-[#141D46] transition hover:bg-[#141D46]/5"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M7.4 8.4h9.2l.7 10.1a1.8 1.8 0 0 1-1.8 1.9h-7a1.8 1.8 0 0 1-1.8-1.9l.7-10.1Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 8.4V7a2.8 2.8 0 0 1 5.6 0v1.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>

      <span
        data-ftt-cart-count
        className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#B39152] px-1 text-[10px] font-semibold text-[#0E0D0E]"
      >
        {count}
      </span>
    </Link>
  );
}
