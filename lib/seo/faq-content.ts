type FaqLink = {
  href: string;
  label: string;
};

export type FaqItem = {
  answer: string;
  links?: FaqLink[];
  question: string;
};

export const OWNER_APPROVED_AEO_GEO_FAQ_QUESTIONS = [
  "What is a pre-loved saree?",
  "Are pre-loved sarees authentic?",
  "Where can I buy authenticated pre-loved sarees in India?",
  "How do I sell my old saree?",
  "How do I store a silk saree?",
  "How do I care for a Kanjeevaram saree?",
  "What is the difference between pre-loved and second-hand sarees?",
  "Are vintage sarees sustainable?",
  "How does From the Trunk verify sarees?",
  "What happens if a one-of-one saree is reserved?",
] as const;

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is From the Trunk?",
    answer:
      "From the Trunk is a curated marketplace for authenticated, pre-loved luxury sarees. We source forgotten treasures from homes across India, meticulously restore them, and give them a second life with a new custodian.",
  },
  {
    question: "What is a pre-loved saree?",
    answer:
      "A pre-loved saree is one that has been worn, cherished, or carefully preserved by someone before you. It is not “second-hand” in the ordinary sense — it is a saree with a history. A silk draped at a wedding. A Kanjeevaram passed down through a family. At From the Trunk, every piece we carry has already had a life, and is ready to be loved again.",
    links: [
      {
        href: "/guides/what-is-a-pre-loved-saree",
        label: "What pre-loved means",
      },
    ],
  },
  {
    question: "Are pre-loved sarees authentic?",
    answer:
      "Yes — and that is non-negotiable for us. Every saree goes through our curation and authentication process before it reaches the collection. If we cannot verify it with confidence, it does not go into the trunk. Simple as that.",
    links: [
      { href: "/authentication", label: "How FTT authenticates every saree" },
      { href: "/how-it-works", label: "How verification works" },
    ],
  },
  {
    question: "Where can I buy authenticated pre-loved sarees in India?",
    answer:
      "You can browse authenticated pre-loved sarees directly through From the Trunk. Each piece in our collection is curated, checked, and listed with care before it is made available. New drops are released regularly, and because every saree is one-of-one, pieces can move quickly.",
    links: [{ href: "/collection", label: "Browse the collection" }],
  },
  {
    question: "How does From the Trunk verify sarees?",
    answer:
      "Every saree is examined for fabric authenticity, weave quality, condition, and origin cues. We look at the feel and weight of the fabric, the quality of the zari, the irregularities of genuine handwork, and the overall condition of the piece. If something does not pass our checks, it does not enter the collection.",
    links: [
      { href: "/authentication", label: "Our authentication standard" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    question: "What is the difference between pre-loved and second-hand sarees?",
    answer:
      "“Second-hand” only tells you that something had a previous owner. “Pre-loved,” the way we use it, means the saree has been selected, inspected, authenticated, and cared for before it reaches you. You understand its fabric, condition, and story. That is the difference between a saree that simply changed hands and one that found its next chapter.",
    links: [
      {
        href: "/guides/pre-loved-vs-second-hand-saree",
        label: "Pre-loved vs second hand",
      },
    ],
  },
  {
    question: "Are vintage sarees sustainable?",
    answer:
      "Yes, choosing a vintage or pre-loved saree can be a deeply sustainable choice. Instead of creating something new, you are choosing a piece that already exists and giving it a longer life. It reduces waste, honours existing craft, and keeps beautiful textiles in circulation.",
    links: [{ href: "/why", label: "Why pre-loved matters" }],
  },
  {
    question: "How do I sell my old saree?",
    answer:
      "If you have sarees sitting unworn — silks, chiffons, designer pieces, or heirlooms — we would love to hear about them. Reach out to us through From the Trunk, and we will guide you through the process. If the piece is a good fit, your saree can find a new home with someone who will truly wear it.",
    links: [{ href: "/sell-your-saree", label: "Sell your saree" }],
  },
  {
    question: "How do I store a silk saree?",
    answer:
      "Wrap your silk saree in a soft muslin cloth, never plastic. Keep it away from direct sunlight and humidity. Refold it every few months along different lines so the fabric does not crease in the same place repeatedly. A small piece of dried neem or camphor can also help keep it fresh.",
    links: [{ href: "/packing", label: "Care and packing" }],
  },
  {
    question: "How do I care for a Kanjeevaram saree?",
    answer:
      "Dry clean only. After wearing, air it out before storing. Never hang it for long periods; fold it gently with the zari facing inward to protect the metallic threads. Store it separately from other sarees so the zari does not snag. Treat it gently, and it can last for generations.",
    links: [{ href: "/packing", label: "Care and packing" }],
  },
  {
    question: "What happens if a one-of-one saree is reserved?",
    answer:
      "Each saree in our collection is truly one-of-one. If a piece you love is reserved or sold, you will not be charged for it. You can message us to check whether it becomes available again, and we can also keep an eye out for something similar in future drops. The trunk is always being restocked — just never with the same piece twice.",
    links: [{ href: "/collection", label: "Browse the collection" }],
  },
  {
    question: "Are the sarees really pre-loved?",
    answer:
      "Yes. Every saree on From the Trunk has been owned and loved before. We believe pre-loved pieces carry unique provenance and character that new sarees simply cannot replicate.",
  },
  {
    question: "Do you offer returns?",
    answer:
      "We accept returns within 7 days of delivery if the piece is significantly different from its description. Because each saree is unique, we encourage you to reach out to us before initiating a return.",
  },
  {
    question: "How do you ship the sarees?",
    answer:
      "We ship all sarees carefully wrapped in tissue wrap, packed in our signature recycled saree cloth bag, and carefully nestled in our brand box. We ship across PAN India only, with no international shipping. Orders are dispatched through Shiprocket and/or DTDC.",
  },
  {
    question: "How do I care for my saree?",
    answer:
      "Dry clean only. Store them in a breathable muslin or cotton cloth bag and keep it away from direct sunlight and humidity. Avoid plastic storage as it can trap moisture and damage the fabric.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards, UPI, net banking, and wallets via our secure payment gateway. All transactions are processed in INR.",
  },
  {
    question: "Does From the Trunk save the photo I use for AI try-on?",
    answer:
      "No. Your working photo and generated previews are stored locally in your browser, not in From the Trunk's database, object storage, filesystem, or server cache. When you deliberately create a drape, the photo is processed transiently through our hosting infrastructure and sent with the selected saree reference to the disclosed AI provider, whose API data policy also applies.",
    links: [
      {
        href: "/policies/privacy-policy",
        label: "Read our privacy policy",
      },
    ],
  },
  {
    question: "How do I delete my virtual try-on photos?",
    answer:
      "Use Remove photo in the Drape Room photo menu, or Clear my try-on data inside the Drape Room. Either control removes your working photo and locally stored previews from this browser. A downloaded image or a copy shared to another app is controlled by your device and must be removed there separately.",
  },
  {
    question: "Why has my saved try-on disappeared?",
    answer:
      "Try-on images live only in this browser and may disappear if you clear site data, use private browsing, switch browsers or devices, replace or remove your photo, or if the browser evicts older previews to stay within its local storage limit.",
  },
  {
    question: "Is the AI try-on an exact representation of the saree?",
    answer:
      "No. It is an AI-generated styling preview, not a product photograph or a guarantee of fit, colour, scale, drape, texture, border, motif, pallu, or fabric fall. Always use the product page photographs and description when deciding whether to buy.",
  },
  {
    question: "Will opening the same saree generate another image?",
    answer:
      "No. Opening a product or the Drape Room never starts an AI generation. If the matching preview is already saved in this browser, it opens locally without another request. A new request happens only when you explicitly create the first preview or confirm an uncached background that is marked as using 1 generation.",
  },
  {
    question: "Does changing the AI preview background use another generation?",
    answer:
      "Only when that background has not been created yet. A background marked Saved opens from this browser for free and uses no AI generation. An uncached background is marked Uses 1 generation and opens a confirmation first. Opening the picker, cancelling the confirmation, or returning to a saved background does not start another request.",
  },
  {
    question: "What happens when I replace my photo?",
    answer:
      "When replacement succeeds, the previous working photo is replaced and all previews created from it are removed from this browser. Nothing is generated automatically, and replacing the photo does not reset the daily generation limit. After the new photo passes the local check, you can explicitly create a new preview using 1 generation. You will also be asked to confirm the current provider disclosure before a new AI request if the disclosure or privacy-policy version has changed.",
  },
];

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};
