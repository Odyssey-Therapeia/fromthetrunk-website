import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccountShell } from "@/components/account/account-shell";
import { PRIVATE_NOINDEX_ROBOTS } from "@/lib/seo/route-metadata";

export const metadata: Metadata = {
  title: "Account",
  robots: PRIVATE_NOINDEX_ROBOTS,
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
