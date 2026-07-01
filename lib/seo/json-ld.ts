import type { Product } from "@/types/domain";
import { isGstInclusive } from "@/lib/config/flags";
import { getProductDisplayDetails } from "@/lib/products/display-details";
import { productSeoImageUrls } from "@/lib/seo/image-urls";
import { absoluteUrl, getCanonicalOrigin } from "@/lib/seo/site-url";

/**
 * Generate JSON-LD structured data for a product page.
 * See: https://schema.org/Product
 */
export function productJsonLd(product: Product): Record<string, unknown> {
  const images = productSeoImageUrls(product);
  const displayDetails = getProductDisplayDetails(product);
  const category = product.collection?.name ?? "Pre-loved saree";
  const additionalProperty = [
    displayDetails.fabric
      ? {
          "@type": "PropertyValue",
          name: "Fabric",
          value: displayDetails.fabric,
        }
      : null,
    displayDetails.condition
      ? {
          "@type": "PropertyValue",
          name: "Condition",
          value: displayDetails.condition,
        }
      : null,
    product.storyProvenance
      ? {
          "@type": "PropertyValue",
          name: "Provenance",
          value: product.storyProvenance,
        }
      : null,
  ].filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    productID: product.id,
    sku: product.slug,
    name: product.name,
    description:
      product.storyNarrative ?? `${product.name}: ${displayDetails.fabric}.`,
    ...(images.length > 0 ? { image: images } : {}),
    brand: {
      "@type": "Brand",
      name: "From the Trunk",
    },
    category,
    ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
    offers: {
      "@type": "Offer",
      price: product.pricePaise / 100,
      priceCurrency: "INR",
      // When GST-inclusive flag is ON, the listed price is the all-in price.
      // valueAddedTaxIncluded signals this to structured-data consumers.
      ...(isGstInclusive() ? { valueAddedTaxIncluded: true } : {}),
      availability:
        product.stockStatus === "sold"
          ? "https://schema.org/OutOfStock"
          : product.stockStatus === "reserved"
            ? "https://schema.org/LimitedAvailability"
            : "https://schema.org/InStock",
      url: absoluteUrl(`/collection/${product.slug}`),
      seller: {
        "@type": "Organization",
        name: "From the Trunk",
      },
    },
    ...(product.detailsCondition
      ? { itemCondition: "https://schema.org/UsedCondition" }
      : {}),
    material: displayDetails.fabric,
  };
}

/**
 * Generate JSON-LD for the organization.
 */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "From the Trunk",
    url: getCanonicalOrigin(),
    logo: absoluteUrl("/Ftt_logo_navbar.png"),
    sameAs: ["https://www.instagram.com/from.thetrunk/"],
    description:
      "Curated collection of authenticated, pre-loved luxury sarees with provenance.",
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@fromthetrunk.shop",
      contactType: "customer service",
      areaServed: "IN",
      availableLanguage: ["en"],
    },
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "From the Trunk",
    url: getCanonicalOrigin(),
    publisher: {
      "@type": "Organization",
      name: "From the Trunk",
      logo: absoluteUrl("/Ftt_logo_navbar.png"),
    },
  };
}

/**
 * Serialize JSON-LD data for safe inline embedding in a <script> tag.
 *
 * JSON.stringify does not escape `<`, so a value containing `</script>`
 * would cause the HTML parser to close the script block early (XSS vector).
 * Unicode-escaping `<` fixes this while remaining valid JSON — parsers decode
 * `<` back to `<` transparently.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Generate breadcrumb JSON-LD.
 */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
