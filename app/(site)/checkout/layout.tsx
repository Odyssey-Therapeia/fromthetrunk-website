import type { ReactNode } from "react";

import { Providers } from "@/components/providers";

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
