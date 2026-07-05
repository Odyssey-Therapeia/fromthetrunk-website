import "../globals.css";

import type { ReactNode } from "react";

import { ADMIN_METADATA } from "@/lib/seo/route-metadata";

export const metadata = ADMIN_METADATA;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
