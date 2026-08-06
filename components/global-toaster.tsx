"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Toaster = dynamic(
  () => import("sonner").then((module) => module.Toaster),
  { ssr: false },
);

export function GlobalToaster() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          fontFamily: "var(--font-sans)",
          borderRadius: "0.75rem",
        },
      }}
    />
  );
}
