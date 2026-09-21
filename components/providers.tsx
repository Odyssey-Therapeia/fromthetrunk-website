"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CollectionStockProvider } from "@/lib/realtime/use-collection-stock";
import { CommerceAuthDialog } from "@/components/commerce/commerce-auth-dialog";
import { CommerceAuthProvider } from "@/components/commerce/commerce-auth-provider";
import { CommerceIntentRunners } from "@/components/commerce/commerce-intent-runners";
import { CartExpirySweeper } from "@/components/cart/cart-expiry-sweeper";
import { CartServerSync } from "@/components/cart/cart-server-sync";
import { CartTabSync } from "@/components/cart/cart-tab-sync";
import { DrapeCoachmarkProvider } from "@/components/drape-room/launch/drape-coachmark-context";
import { SessionProvider } from "next-auth/react";

export function CommerceProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <QueryClientProvider client={queryClient}>
        {/*
          Inside CommerceProviders on purpose: the Drape Room mounts this tree
          too, so a sign-in raised from inside the room reaches the same single
          dialog instead of stacking one of its own.
        */}
        <CommerceAuthProvider>
          {children}
          <CommerceAuthDialog />
          {/* Replays the click that triggered sign-in, once it succeeds. */}
          <CommerceIntentRunners />
          {/* Mirrors the account's bag into the store the UI already reads. */}
          <CartServerSync />
          {/* Invalidates other tabs and refreshes exactly when a hold expires. */}
          <CartTabSync />
          <CartExpirySweeper />
        </CommerceAuthProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CommerceProviders>
      {/*
        One live stock source for every product card on the page. It stays
        silent until a card registers, so pages without a grid pay nothing.
        The coach mark provider sits inside it so a Drape Room trigger can
        register itself from anywhere in the tree.
      */}
      <CollectionStockProvider>
        <DrapeCoachmarkProvider>{children}</DrapeCoachmarkProvider>
      </CollectionStockProvider>
    </CommerceProviders>
  );
}
