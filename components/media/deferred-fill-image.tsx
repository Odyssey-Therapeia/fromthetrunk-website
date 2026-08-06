"use client";

import { useEffect, useRef, useState } from "react";
import Image, { type ImageProps } from "next/image";

type DeferredFillImageProps = Omit<
  ImageProps,
  "fill" | "loading" | "priority"
> & {
  rootMargin?: string;
};

/**
 * Defers below-the-fold and horizontally clipped media until it is genuinely
 * near the viewport. Native image lazy-loading only considers vertical
 * distance, so carousel slides at the same document Y otherwise all download.
 */
export function DeferredFillImage({
  alt,
  rootMargin = "320px 120px",
  ...props
}: DeferredFillImageProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setShouldLoad(true), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <span
      ref={containerRef}
      className="absolute inset-0"
      aria-hidden={alt ? undefined : "true"}
    >
      {shouldLoad ? (
        <Image {...props} alt={alt} fill loading="lazy" />
      ) : null}
    </span>
  );
}
