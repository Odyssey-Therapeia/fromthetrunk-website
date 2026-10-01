import { Cormorant_Garamond, Jost } from "next/font/google";

import { cn } from "@/lib/utils";

// Brand-book faces, loaded for the Journal only. Headlines use Cormorant
// Garamond; UI and body use Jost. The italic (closing lines only) is not
// preloaded, so it never competes with the hero for bandwidth.
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--journal-font-serif",
});

const serifItalic = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "500",
  style: "italic",
  display: "swap",
  preload: false,
  variable: "--journal-font-serif-italic",
});

const sans = Jost({
  subsets: ["latin"],
  display: "swap",
  variable: "--journal-font-sans",
});

/** Scopes the Journal's brand tokens and fonts (see `.journal-theme` in globals.css). */
export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(serif.variable, serifItalic.variable, sans.variable, "journal-theme antialiased")}>
      {children}
    </div>
  );
}
