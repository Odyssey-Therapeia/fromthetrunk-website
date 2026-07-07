"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

import { trackWhatsappClick } from "@/lib/analytics/track";

/**
 * Drop-in replacement for an `<a>` that points at WhatsApp, adding a
 * `ftt_click_whatsapp` analytics event on click. Works inside server components
 * (it is a client component). `location` identifies which CTA was clicked.
 */
export function WhatsAppLink({
  location,
  children,
  onClick,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  location: string;
}) {
  return (
    <a
      {...anchorProps}
      onClick={(event) => {
        trackWhatsappClick(location);
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
