"use client";

import { Instagram, Mail, MessageCircle } from "lucide-react";

import { ContactWizard } from "@/components/contact/contact-wizard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CONTACT_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/from.thetrunk/",
    Icon: Instagram,
  },
  {
    label: "WhatsApp",
    href: "https://wa.me/919731910202",
    Icon: MessageCircle,
  },
  {
    label: "Email",
    href: "mailto:hello@fromthetrunk.shop",
    Icon: Mail,
  },
] as const;

export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-[#601D1C]/10 bg-[#FDF7F1]">
        <DialogHeader className="text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
            Connect with us
          </p>
          <DialogTitle className="font-serif text-3xl leading-tight text-[#141D46]">
            Looking for a saree with a story?
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#601D1C]/70">
            A few quick questions and our team will be in touch — for buying,
            selling, styling, or anything else.
          </DialogDescription>
        </DialogHeader>

        {/* Radix unmounts this content when the dialog closes, so the wizard
            resets to step 1 on the next open. */}
        <ContactWizard
          surface="dialog"
          onSuccess={() => onOpenChange(false)}
          className="mt-1"
        />

        <div className="mt-2 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#601D1C]/12" aria-hidden="true" />
          <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-[#601D1C]/45">
            Or reach us directly
          </span>
          <span className="h-px flex-1 bg-[#601D1C]/12" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CONTACT_LINKS.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
              aria-label={label}
              className="group flex items-center justify-center gap-2 rounded-2xl border border-[#601D1C]/10 bg-[#141D46] px-3 py-3.5 text-[#FDF7F1] transition hover:bg-[#601D1C]"
            >
              <Icon className="h-4 w-4 text-[#B39152] transition group-hover:text-[#E5C983]" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                {label}
              </span>
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
