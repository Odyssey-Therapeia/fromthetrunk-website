import type { Metadata } from "next";

import { getGlobals } from "@/lib/data/products";
import { publicPageMetadata } from "@/lib/seo/metadata";

import { HowItWorksExperience } from "./how-it-works-experience";

export const revalidate = 300;

export const metadata: Metadata = publicPageMetadata({
  title: "How It Works",
  description:
    "Give your saree a second life. From sourcing to doorstep delivery, every piece is authenticated, restored, packed, and cared for with respect for its heritage.",
  path: "/how-it-works",
});

export default async function HowItWorksPage() {
  const howItWorksPage = await getGlobals("howItWorksPage", {
    includeDrafts: false,
  });

  const textOrFallback = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback;

  const steps = [
    {
      title: textOrFallback(howItWorksPage?.stepOneTitle, "Sourcing"),
      description: textOrFallback(
        howItWorksPage?.stepOneBody,
        "We receive pre-loved sarees from homes, family trunks, and private wardrobes where beautiful textiles are waiting for their next chapter.",
      ),
    },
    {
      title: textOrFallback(howItWorksPage?.stepTwoTitle, "Quality Control"),
      description: textOrFallback(
        howItWorksPage?.stepTwoBody,
        "Every piece goes through a careful 360° check for fabric strength, marks, tears, zari condition, border integrity, pallu details, and wearability.",
      ),
    },
    {
      title: textOrFallback(howItWorksPage?.stepThreeTitle, "Eco-Restoration"),
      description: textOrFallback(
        howItWorksPage?.stepThreeBody,
        "We clean, steam, mend, and prepare each saree with a light-touch restoration process that respects the original fabric and its age.",
      ),
    },
    {
      title: textOrFallback(
        howItWorksPage?.stepFourTitle,
        "Sustainable Packaging",
      ),
      description: textOrFallback(
        howItWorksPage?.stepFourBody,
        "Each saree is folded with care, wrapped in muslin, and prepared in FTT packaging designed to protect the textile and preserve its story.",
      ),
    },
    {
      title: "Doorstep Magic",
      description:
        "Your order is dispatched safely with tracking, care guidance, and the quiet joy of opening a one-of-one piece chosen just for you.",
    },
  ];

  return (
    <HowItWorksExperience
      eyebrow={textOrFallback(howItWorksPage?.eyebrow, "How It Works")}
      title={textOrFallback(
        howItWorksPage?.title,
        "A second life, handled with care",
      )}
      description={textOrFallback(
        howItWorksPage?.description,
        "Have a pre-loved saree you are ready to part with? We thoughtfully review, authenticate, restore, photograph, and prepare each piece so it can be loved all over again.",
      )}
      steps={steps}
    />
  );
}