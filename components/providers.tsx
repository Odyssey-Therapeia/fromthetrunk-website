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

export function CommerceProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}

function DeferredWishlistMerge() {
  const [deferredEffectsReady, setDeferredEffectsReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredEffectsReady(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return deferredEffectsReady ? <WishlistMergeOnLogin /> : null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CommerceProviders>
      {/* Route-scoped guest wishlist merge. The global Drape Room reuses only
          CommerceProviders so this side effect is never mounted twice. */}
      <DeferredWishlistMerge />
      {children}
    </CommerceProviders>
  );
}
