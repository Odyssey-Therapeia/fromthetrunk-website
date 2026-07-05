type ProductAltSource = {
  detailsFabric?: null | string;
  name?: null | string;
};

const cleanText = (value: null | string | undefined) => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : null;
};

const normalizeFabric = (value: null | string | undefined) => {
  const fabric = cleanText(value);
  if (!fabric) return null;

  return fabric.replace(/\bsarees?\b/gi, "").replace(/\s+/g, " ").trim() || null;
};

const productName = (name: null | string | undefined) =>
  cleanText(name) ?? "From the Trunk saree";

export function buildProductCardAlt(product: ProductAltSource): string {
  const name = productName(product.name);
  const fabric = normalizeFabric(product.detailsFabric);
  const fabricPhrase = fabric ? `${fabric} saree` : "saree";

  return `${name}, pre-loved ${fabricPhrase} from From the Trunk`;
}

export function buildPdpMainImageAlt(product: ProductAltSource): string {
  const name = productName(product.name);
  const fabric = normalizeFabric(product.detailsFabric);
  const detail = fabric ? `, ${fabric}` : "";

  return `${name} shown as a pre-loved saree${detail}`;
}

export function buildPdpGalleryImageAlt(
  product: ProductAltSource,
  index: number,
): string {
  const name = productName(product.name);
  const safeIndex = Math.max(0, index);

  if (safeIndex === 0) return buildPdpMainImageAlt(product);

  return `${name} detail view ${safeIndex + 1}`;
}
