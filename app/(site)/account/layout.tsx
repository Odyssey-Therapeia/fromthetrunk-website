import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountShell } from "@/components/account/account-shell";
import { Providers } from "@/components/providers";
import { CUSTOMER_NOINDEX_FOLLOW_ROBOTS } from "@/lib/seo/route-metadata";

export const metadata: Metadata = {
  title: "Account",
  robots: CUSTOMER_NOINDEX_FOLLOW_ROBOTS,
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AccountShell>{children}</AccountShell>
    </Providers>
  );
}
