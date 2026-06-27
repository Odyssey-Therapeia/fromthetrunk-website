/**
 * From the Trunk legal/policy content. One source of truth for the policy hub
 * (`/policies`) and detail pages (`/policies/[slug]`).
 *
 * Placeholders intentionally left for the legal/business team to confirm:
 *   [DATE], registered legal entity name, GSTIN, [REGISTERED ADDRESS],
 *   grievance officer [NAME]/[DESIGNATION], [PHONE NUMBER], shipping partners,
 *   international shipping locations, refund timelines, jurisdiction.
 */

export type PolicySection = {
  id: string;
  title: string;
  body: string[];
};

export type LegalPolicy = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  lastUpdated: string;
  sections: PolicySection[];
};

const CONTACT_EMAIL = "hello@fromthetrunk.shop";

export const policies: LegalPolicy[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    eyebrow: "Your data",
    description:
      "How From the Trunk collects, uses, protects, and handles personal information.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "information-we-collect",
        title: "Information we collect",
        body: [
          "Account information: full name, email address, phone number, password credentials, login method, and account preferences.",
          "Order and delivery information: shipping address, billing address, order details, product selections, packaging choices, delivery notes, and order history.",
          "Payment information: payment status, transaction reference, refund reference, and payment confirmation details. We do not store your card number, UPI PIN, CVV, netbanking password, or wallet credentials. Payments are processed through our payment gateway partner.",
          "Wishlist and browsing information: products you save, cart activity, pages viewed, device/browser information, IP address, cookies, and similar technical data used to keep the website secure and improve the shopping experience.",
          "Customer support information: messages, emails, WhatsApp or chat communications, product queries, return requests, complaint details, images/videos shared for verification, and feedback.",
          "Seller/consignor submission information: if you submit sarees to sell through FTT, we may collect your name, contact details, saree photos, provenance details, condition notes, ownership confirmation, payout details, and related communications.",
        ],
      },
      {
        id: "how-we-use-information",
        title: "How we use your information",
        body: [
          "We use your information to create and manage your account; process orders, payments, shipping, returns, refunds, and customer support; save your wishlist, cart, addresses, and order history; authenticate, document, and prepare pre-loved sarees; send order, delivery, return, and service messages; respond to queries and complaints; prevent fraud, misuse, and security incidents; improve our website, collections, and product discovery; comply with legal, tax, accounting, consumer-protection, and payment-processing requirements; and send marketing messages only where permitted or where you have opted in.",
        ],
      },
      {
        id: "consent-and-withdrawal",
        title: "Consent and withdrawal",
        body: [
          "Where required, we ask for your consent before processing your personal information. You may withdraw consent for optional uses such as marketing communications.",
          "Withdrawal of consent may affect services that depend on that information, such as account access, order fulfilment, delivery updates, or saved-address features.",
        ],
      },
      {
        id: "sharing",
        title: "Sharing of information",
        body: [
          "We may share limited information with payment gateway partners; shipping and logistics partners; authentication, restoration, and packaging partners; technology, hosting, analytics, email, SMS, WhatsApp, and customer-support providers; professional advisers such as accountants, auditors, lawyers, and compliance consultants; and government, regulatory, law-enforcement, or dispute-resolution authorities where required.",
          "We do not sell your personal information.",
        ],
      },
      {
        id: "payment-security",
        title: "Payment security",
        body: [
          "Payments are processed by third-party payment gateway partners. FTT does not store sensitive payment credentials such as card numbers, CVV, UPI PIN, or banking passwords.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies and similar technologies",
        body: [
          "We may use cookies and similar technologies to keep you signed in, remember cart/wishlist activity, improve performance, measure traffic, secure the website, and understand how customers use the site.",
          "You can control cookies through your browser settings, but some features may not work properly if cookies are disabled.",
        ],
      },
      {
        id: "data-retention",
        title: "Data retention",
        body: [
          "We retain personal information only as long as necessary for the purposes described in this policy, including order fulfilment, customer support, tax/accounting obligations, fraud prevention, legal compliance, dispute resolution, and legitimate business records.",
        ],
      },
      {
        id: "your-rights",
        title: "Your rights",
        body: [
          "Subject to applicable law, you may request access to your personal data, correction or updating of inaccurate data, deletion of data where applicable, withdrawal of consent for optional processing, and grievance redressal.",
          `To make a request, contact us at ${CONTACT_EMAIL}.`,
        ],
      },
      {
        id: "childrens-privacy",
        title: "Children's privacy",
        body: [
          "FTT is not intended for children. We do not knowingly collect personal information from children without appropriate consent required by law.",
        ],
      },
      {
        id: "security",
        title: "Security",
        body: [
          "We use reasonable technical and organisational safeguards to protect personal information. However, no online system is completely secure, and customers are responsible for keeping account credentials confidential.",
        ],
      },
      {
        id: "third-party-links",
        title: "Third-party links",
        body: [
          "Our website may contain links to third-party websites, payment pages, social media pages, or delivery partners. Their privacy practices are governed by their own policies.",
        ],
      },
      {
        id: "updates",
        title: "Updates to this policy",
        body: [
          "We may update this Privacy Policy from time to time. The updated version will be posted on this page with the revised “Last updated” date.",
        ],
      },
      {
        id: "contact",
        title: "Contact and grievance",
        body: [
          `For privacy questions, data requests, or grievances, contact From the Trunk at ${CONTACT_EMAIL}.`,
          "Grievance Officer: [NAME], [DESIGNATION]. Registered address: [REGISTERED BUSINESS ADDRESS]. Phone: [PHONE NUMBER].",
        ],
      },
    ],
  },
  {
    slug: "return-refund-policy",
    title: "Return, Refund & Exchange Policy",
    eyebrow: "Returns",
    description:
      "How returns, refunds, exchanges, and unique product concerns are handled.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "return-window",
        title: "Return window",
        body: [
          "You may request a return within 7 days of delivery if the saree is significantly different from its product description, if the wrong item was delivered, or if the item has an undisclosed major defect.",
          "Return requests made after 7 days of delivery may not be accepted.",
        ],
      },
      {
        id: "eligible",
        title: "When a return is eligible",
        body: [
          "A return may be accepted if the saree received is significantly different from the listing; the wrong product was delivered; there is a major defect not disclosed on the product page; the item was damaged in transit and reported promptly with clear photos/videos; or the product fails our stated authentication or condition promise.",
        ],
      },
      {
        id: "not-eligible",
        title: "When a return is not eligible",
        body: [
          "Because every piece is pre-loved and unique, returns are not accepted for change of mind; slight colour variation due to screen, lighting, or photography differences; minor age-related marks already disclosed or consistent with pre-loved textiles; preference-based reasons such as weight, drape, feel, shade, or styling expectations; damage caused after delivery, wear, washing, dry cleaning, ironing, perfume, stains, folding, or storage; items returned without original tags, labels, authentication card, muslin wrap, or packaging where applicable; items that appear used, altered, damaged, or tampered with after delivery; or international orders, except where required by law or where FTT shipped the wrong/significantly misdescribed item.",
        ],
      },
      {
        id: "condition",
        title: "Condition of returned item",
        body: [
          "To be eligible for return, the saree must be unused, unwashed, unaltered, unstained, and returned with all original tags, labels, authentication/provenance cards, muslin wrap, and packaging.",
        ],
      },
      {
        id: "how-to-request",
        title: "How to request a return",
        body: [
          `Email us at ${CONTACT_EMAIL} within 7 days of delivery with your order number; registered email/phone number; reason for return; clear photos and/or video of the issue; and photos of packaging if the product was damaged in transit.`,
          "Our team may ask for additional images or a short video before approving the return.",
        ],
      },
      {
        id: "approval-and-pickup",
        title: "Return approval and pickup",
        body: [
          "After reviewing your request, we will confirm whether the return is approved. If approved, we will share return-shipping instructions or arrange a pickup where available.",
          "Please do not send an item back without return approval.",
        ],
      },
      {
        id: "quality-check",
        title: "Quality check after return",
        body: [
          "Once we receive the item, it will undergo a quality check. If the returned item does not meet the return conditions, we may reject the return and ship the item back to you.",
        ],
      },
      {
        id: "refund-timeline",
        title: "Refund timeline",
        body: [
          "If the return is approved after quality check, the refund will be processed to the original payment method. Refund timelines depend on the payment method, bank, and payment gateway, but are generally completed within 7–10 business days after approval.",
        ],
      },
      {
        id: "shipping-charges",
        title: "Shipping charges",
        body: [
          "Original shipping, premium packaging, international shipping, customs duties, taxes, and return-shipping charges may be non-refundable unless the return is due to our error, a wrong item, or an approved significant misdescription.",
        ],
      },
      {
        id: "exchanges",
        title: "Exchanges and store credit",
        body: [
          "We generally do not offer exchanges because each saree is unique. If a return is approved, you may place a fresh order for another available piece.",
          "In some cases, FTT may offer store credit instead of a refund, but only with your agreement.",
        ],
      },
      {
        id: "damaged-package",
        title: "Damaged or missing package",
        body: [
          "If your parcel appears damaged, tampered with, or incomplete at delivery, please photograph the package before opening and contact us within 48 hours.",
        ],
      },
      {
        id: "final-decision",
        title: "Final decision",
        body: [
          "FTT reserves the right to approve or reject return requests after reviewing the product, listing details, submitted evidence, and returned item condition.",
        ],
      },
    ],
  },
  {
    slug: "shipping-delivery-policy",
    title: "Shipping & Delivery Policy",
    eyebrow: "Delivery",
    description:
      "Processing time, packaging, tracking, shipping charges, and delivery support.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "processing",
        title: "Processing time",
        body: [
          "Orders are usually processed within 2–5 business days after payment confirmation. During launches, festive periods, or restoration/quality-check delays, processing may take longer.",
        ],
      },
      {
        id: "packaging",
        title: "Packaging",
        body: [
          "Every saree is carefully folded, wrapped in muslin, and packed with care. Depending on your selected delivery option, your order may be shipped in normal care packaging or premium trunk-inspired packaging.",
        ],
      },
      {
        id: "timelines",
        title: "Delivery timelines",
        body: [
          "Metro cities in India: 3–7 business days after dispatch.",
          "Other Indian locations: 5–10 business days after dispatch.",
          "International orders: timeline depends on destination, customs, and courier partner.",
          "These are estimates and may vary due to courier delays, weather, public holidays, strikes, customs, or force majeure events.",
        ],
      },
      {
        id: "shipping-charges",
        title: "Shipping charges",
        body: [
          "Shipping charges are displayed at checkout before payment. Premium packaging, express shipping, or international shipping may carry additional charges.",
        ],
      },
      {
        id: "tracking",
        title: "Tracking",
        body: [
          "Once your order is dispatched, we will share tracking details by email, SMS, WhatsApp, or your account order page where available.",
        ],
      },
      {
        id: "delivery-attempts",
        title: "Delivery attempts",
        body: [
          "Please ensure the delivery address and phone number are correct. If a courier cannot deliver due to an incorrect address, unavailable recipient, or repeated failed attempts, additional shipping charges may apply for re-dispatch.",
        ],
      },
      {
        id: "international",
        title: "International orders",
        body: [
          "International customers are responsible for customs duties, import taxes, clearance charges, or local fees charged by the destination country.",
        ],
      },
      {
        id: "lost-or-damaged",
        title: "Lost or damaged shipments",
        body: [
          `If a shipment is lost or damaged in transit, please contact us immediately at ${CONTACT_EMAIL}. We will coordinate with the courier partner and help resolve the issue.`,
        ],
      },
      {
        id: "unboxing",
        title: "Unboxing recommendation",
        body: [
          "For high-value pieces, we recommend recording an unboxing video from sealed package to full item view. This helps us resolve any damage or missing-item claim quickly.",
        ],
      },
    ],
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    eyebrow: "Terms",
    description:
      "The terms that govern use of the website, accounts, orders, listings, and payments.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "about",
        title: "About FTT",
        body: [
          "From the Trunk is a curated platform for authenticated, pre-loved luxury sarees. Each piece is unique and may carry age, provenance, restoration, and condition characteristics.",
          "By accessing our website, creating an account, placing an order, submitting a saree, or using our services, you agree to these Terms of Service.",
        ],
      },
      {
        id: "product-information",
        title: "Product information",
        body: [
          "We try to describe each saree as accurately as possible, including fabric, condition, visible imperfections, restoration notes, provenance where available, pricing, and styling information.",
          "Because products are pre-loved, minor irregularities, age marks, colour variation, weave variation, zari softness, fold marks, or signs of prior ownership may be present. These are part of the textile's character unless specifically stated otherwise.",
        ],
      },
      {
        id: "colour-photography",
        title: "Colour and photography",
        body: [
          "Product colours may appear different depending on lighting, screen settings, camera, and device display. We do our best to represent colours accurately, but exact shade matching cannot be guaranteed.",
        ],
      },
      {
        id: "pricing",
        title: "Pricing",
        body: [
          "Prices are listed in INR unless otherwise stated. Prices may change without prior notice. The final amount payable will be shown at checkout before payment.",
        ],
      },
      {
        id: "orders-payments",
        title: "Orders and payments",
        body: [
          "An order is confirmed only after successful payment and order confirmation. FTT reserves the right to cancel an order if the product is unavailable, incorrectly priced, fails final quality check, or appears suspicious/fraudulent.",
          "Payments are processed through secure third-party payment gateway partners. FTT does not store sensitive payment credentials such as card number, CVV, UPI PIN, or banking password.",
        ],
      },
      {
        id: "account",
        title: "Account, wishlist, and cart",
        body: [
          "You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.",
          "Adding a product to wishlist does not reserve it. Adding a one-of-one product to cart creates a time-limited hold; the order is confirmed only after successful payment and order confirmation.",
        ],
      },
      {
        id: "intellectual-property",
        title: "Intellectual property and prohibited use",
        body: [
          "All website content, brand marks, photography, copy, graphics, product descriptions, UI design, and visual identity belong to FTT or its licensors and may not be copied or used without permission.",
          "You may not misuse the website, attempt unauthorised access, interfere with security, upload harmful code, scrape content, misrepresent identity, submit false product claims, or use the website for unlawful purposes.",
        ],
      },
      {
        id: "liability",
        title: "Limitation of liability",
        body: [
          "To the fullest extent permitted by law, FTT is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the website or purchase of products.",
        ],
      },
      {
        id: "governing-law",
        title: "Governing law",
        body: [
          "These Terms are governed by the laws of India. Courts at [Bengaluru, Karnataka] shall have jurisdiction, unless applicable consumer law provides otherwise.",
          `For questions about these Terms, contact ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  {
    slug: "authentication-condition-policy",
    title: "Authentication & Condition Policy",
    eyebrow: "Authenticity",
    description:
      "How we authenticate, grade, and document every pre-loved saree before it is listed.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "authentication",
        title: "Authentication",
        body: [
          "Every saree is reviewed before listing. Our textile desk checks visible craft details, fabric quality, weave characteristics, zari condition, construction, provenance information where available, and overall consistency with the product description.",
        ],
      },
      {
        id: "condition-check",
        title: "Condition check",
        body: [
          "Each saree goes through a condition review before being listed. We check for tears or fabric weakness; stains, marks, or discolouration; zari integrity; border and pallu condition; fall, edging, or stitching condition where applicable; signs of restoration or repair; odour, storage marks, or ageing; and overall wearability.",
        ],
      },
      {
        id: "condition-grades",
        title: "Condition grades",
        body: [
          "Excellent: minimal signs of previous ownership; ready to wear with care.",
          "Very Good: light signs of age or use; minor imperfections that do not affect overall wearability.",
          "Good: visible signs of age, restoration, or use; still wearable and beautiful, with condition notes disclosed.",
          "Restoration-ready: a rare or valuable piece that may require additional care before frequent wear.",
        ],
      },
      {
        id: "pre-loved-character",
        title: "Pre-loved character",
        body: [
          "Pre-loved sarees may carry small marks, weave irregularities, softened zari, faint fold lines, slight fading, or age-related details. We consider these part of the textile's story unless they materially affect the product and are not disclosed.",
        ],
      },
      {
        id: "final-check",
        title: "Final check before dispatch",
        body: [
          "Before dispatch, each order undergoes a final check. If we find a new issue that materially affects the product, we may contact you before shipping or cancel/refund the order.",
        ],
      },
      {
        id: "authenticity-guarantee",
        title: "Authenticity guarantee",
        body: [
          `If a saree is found to be materially misrepresented by us, please contact us within 7 days of delivery at ${CONTACT_EMAIL} with supporting photos and order details. We will review the case under our Return, Refund & Exchange Policy.`,
        ],
      },
    ],
  },
  {
    slug: "care-packaging-policy",
    title: "Care & Packaging Policy",
    eyebrow: "Care",
    description:
      "How to store, wear, and care for your pre-loved saree, and how we package it.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "general-care",
        title: "General care",
        body: [
          "Unless otherwise stated, dry clean only. Avoid machine washing, harsh detergents, bleach, soaking, tumble drying, or direct ironing on zari or delicate fabric.",
        ],
      },
      {
        id: "storage",
        title: "Storage",
        body: [
          "Store your saree in the muslin wrap provided. Keep it away from direct sunlight, humidity, perfume, and plastic covers. Refold occasionally to avoid permanent crease lines.",
        ],
      },
      {
        id: "delicate-fabrics",
        title: "Zari and delicate fabrics",
        body: [
          "Zari, silk, chiffon, organza, georgette, and vintage cottons may require special care. Avoid pulling, pinning aggressively, or storing under heavy pressure.",
        ],
      },
      {
        id: "wearing-care",
        title: "Wearing care",
        body: [
          "Use smooth jewellery and blouse hooks to avoid snags. Avoid spraying perfume directly on the saree. If the saree is very delicate, we recommend draping with professional assistance.",
        ],
      },
      {
        id: "packaging",
        title: "Packaging",
        body: [
          "FTT packaging is designed to protect the saree during transit and preserve its story. Depending on checkout selection, your order may include muslin wrap, care card, authentication/provenance card, and trunk-inspired packaging.",
        ],
      },
      {
        id: "damage-after-delivery",
        title: "Damage after delivery",
        body: [
          "FTT is not responsible for damage caused by use, styling, washing, dry cleaning, storage, or alteration after delivery.",
        ],
      },
    ],
  },
  {
    slug: "cancellation-policy",
    title: "Cancellation Policy",
    eyebrow: "Cancellations",
    description:
      "How and when an order can be cancelled — by you, or by From the Trunk.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "before-dispatch",
        title: "Cancellation before dispatch",
        body: [
          `You may request cancellation before the order is dispatched by contacting ${CONTACT_EMAIL} with your order number.`,
          "If the order has not been packed or dispatched, we will cancel it and process a refund to the original payment method.",
        ],
      },
      {
        id: "after-dispatch",
        title: "Cancellation after dispatch",
        body: [
          "Once an order has been dispatched, it cannot be cancelled. You may request a return after delivery only if it qualifies under our Return, Refund & Exchange Policy.",
        ],
      },
      {
        id: "unique-hold",
        title: "Unique product hold",
        body: [
          "Because each saree is unique, placing an order temporarily reserves that piece for you. Please complete payment only when you are sure about the purchase.",
        ],
      },
      {
        id: "cancellation-by-ftt",
        title: "Cancellation by FTT",
        body: [
          "FTT may cancel an order if payment fails or cannot be verified; the product is unavailable due to inventory error; the product does not pass final quality check before dispatch; the order appears fraudulent or suspicious; delivery information is incomplete or unreachable; or service to the delivery location is unavailable.",
          "If we cancel an order after payment, we will process a refund to the original payment method.",
        ],
      },
      {
        id: "cancellation-charges",
        title: "Cancellation charges",
        body: [
          "FTT does not charge cancellation fees unless a similar cost is also borne by FTT in a matching situation, in line with applicable ecommerce rules.",
        ],
      },
    ],
  },
  {
    slug: "sell-with-us-policy",
    title: "Sell With Us Policy",
    eyebrow: "Consign",
    description:
      "How to submit a saree to From the Trunk for consignment and curation.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "what-to-submit",
        title: "What you can submit",
        body: [
          "You may submit sarees with craft value, provenance, textile interest, festive/bridal relevance, heirloom quality, or strong styling potential.",
        ],
      },
      {
        id: "how-to-submit",
        title: "How to submit",
        body: [
          `Email ${CONTACT_EMAIL} with clear photos of the full saree, border, pallu, body, blouse piece if any, and visible issues; fabric/weave details if known; age or provenance story if available; current condition; and your location and contact details.`,
        ],
      },
      {
        id: "review",
        title: "Review process",
        body: [
          "FTT may review submissions based on condition, craft, authenticity, market fit, restoration needs, and brand curation. Submission does not guarantee acceptance.",
        ],
      },
      {
        id: "ownership",
        title: "Ownership confirmation",
        body: [
          "By submitting a saree, you confirm that you are the lawful owner or authorised custodian and that the item is not counterfeit, stolen, encumbered, or subject to any dispute.",
        ],
      },
      {
        id: "pricing-commission",
        title: "Pricing and commission",
        body: [
          "If accepted, pricing, commission, payout timeline, restoration cost, photography, listing rights, and return-to-owner terms will be shared separately in writing.",
        ],
      },
      {
        id: "rejection-return",
        title: "Rejection or return",
        body: [
          "FTT may decline a submission at its discretion. If a physical piece has been sent to us and is not accepted, return-shipping responsibility will be agreed before shipment.",
        ],
      },
      {
        id: "story-rights",
        title: "Story and photography rights",
        body: [
          "If your saree is accepted, you permit FTT to photograph, describe, style, market, and sell the piece using brand photography, product copy, and provenance notes where appropriate.",
        ],
      },
      {
        id: "contact",
        title: "Contact",
        body: [
          `Submit to ${CONTACT_EMAIL} with the subject “Saree Submission — [Your Name]”.`,
        ],
      },
    ],
  },
  {
    slug: "grievance-redressal",
    title: "Grievance Redressal Policy",
    eyebrow: "Support",
    description:
      "How to reach us, and how we acknowledge and resolve grievances.",
    lastUpdated: "[DATE]",
    sections: [
      {
        id: "customer-support",
        title: "Customer support",
        body: [
          `For order, shipping, product, return, refund, account, or payment questions, contact us by email at ${CONTACT_EMAIL} or by phone/WhatsApp at [PHONE NUMBER].`,
          "Working hours: [DAYS + HOURS].",
        ],
      },
      {
        id: "grievance-officer",
        title: "Grievance Officer",
        body: [
          "Name: [NAME]. Designation: Grievance Officer. Email: [GRIEVANCE EMAIL]. Address: [REGISTERED ADDRESS].",
        ],
      },
      {
        id: "acknowledgement",
        title: "Complaint acknowledgement",
        body: [
          "We aim to acknowledge customer complaints within 48 hours of receipt.",
        ],
      },
      {
        id: "resolution-timeline",
        title: "Resolution timeline",
        body: [
          "We aim to resolve grievances within one month from the date of receipt, subject to receiving all information needed from the customer, courier partner, payment gateway, or relevant third party.",
        ],
      },
      {
        id: "what-to-include",
        title: "What to include",
        body: [
          "Please include your order number; registered email/phone number; a clear description of the issue; photos/videos where relevant; and your preferred resolution.",
        ],
      },
      {
        id: "escalation",
        title: "Escalation",
        body: [
          "If your issue is not resolved through customer support, you may escalate it to the Grievance Officer using the contact details above.",
        ],
      },
    ],
  },
];

export function getPolicyBySlug(slug: string): LegalPolicy | undefined {
  return policies.find((policy) => policy.slug === slug);
}
