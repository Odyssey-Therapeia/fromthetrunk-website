"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";

const WishlistMergeOnLogin = dynamic(
  () =>
    import("@/components/wishlist/wishlist-merge-on-login").then(
      (module) => module.WishlistMergeOnLogin,
    ),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [deferredEffectsReady, setDeferredEffectsReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredEffectsReady(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <QueryClientProvider client={queryClient}>
        {/* Session-scoped guest wishlist merge — runs on every page after login,
            not only on pages that happen to mount a WishlistButton. */}
        {deferredEffectsReady ? <WishlistMergeOnLogin /> : null}
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
