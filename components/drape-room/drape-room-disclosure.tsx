"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { PublicTryOnConfig } from "@/lib/drape-room/client/types";
import { cn } from "@/lib/utils";

export function DrapeRoomPrivacyDisclosure({
  config,
  compact = false,
  onClear,
  clearDisabled = false,
}: {
  config: PublicTryOnConfig | null;
  compact?: boolean;
  onClear?: () => void;
  clearDisabled?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-ftt-gold/25 bg-ftt-gold/8 text-ftt-burgundy/80",
        compact ? "p-3 text-[11px]" : "p-4 text-xs",
      )}
      aria-labelledby="drape-room-privacy-title"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ftt-card text-ftt-burgundy">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="drape-room-privacy-title"
              className="font-serif text-lg leading-tight text-ftt-navy"
            >
              Your photo stays under your control
            </h3>
            {config ? (
              <span className="max-w-full truncate rounded-full border border-ftt-gold/30 bg-ftt-card px-2.5 py-1 text-[10px] font-semibold text-ftt-burgundy">
                {config.providerDisplayName} · {config.model}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 leading-5">
            Your working photo and previews stay in this browser. From the
            Trunk does not save them in its own database or object storage.
          </p>

          {!config ? (
            <p className="mt-2 rounded-xl bg-ftt-card px-3 py-2 font-semibold leading-5">
              Provider configuration is not currently available. Generation
              stays off, but local photo and cached-preview tools still work.
            </p>
          ) : null}

          <Accordion type="single" collapsible className="mt-1">
            <AccordionItem value="handling" className="border-ftt-gold/20">
              <AccordionTrigger className="min-h-11 py-2 text-xs text-ftt-burgundy hover:no-underline">
                Privacy, provider, and data handling
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-2 text-[11px] leading-5">
                {config ? (
                  <>
                    <p>
                      Only after you consent and select Create my drape are
                      your photo and this saree sent through our hosting
                      infrastructure to {config.providerDisplayName}. The
                      provider may process or retain them under its API policy.
                    </p>
                    <p>{config.providerRetentionSummary}</p>
                    <a
                      href={config.providerPolicyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline underline-offset-2"
                    >
                      Read {config.providerDisplayName}’s API data policy
                    </a>
                    <span aria-hidden="true"> · </span>
                  </>
                ) : (
                  <p>
                    No provider consent is requested and no photo can be sent
                    while secure generation is unavailable.
                  </p>
                )}
                <Link
                  href="/policies/privacy-policy"
                  prefetch={false}
                  className="font-semibold underline underline-offset-2"
                >
                  FTT Privacy Policy
                </Link>
                {config ? (
                  <p>Disclosure version: {config.disclosureVersion}</p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              disabled={clearDisabled}
              className="mt-2 min-h-11 rounded-full border border-ftt-burgundy/25 px-4 font-semibold text-ftt-burgundy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ftt-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear my try-on data
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
