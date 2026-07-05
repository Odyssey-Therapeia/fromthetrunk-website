export const BLOUSE_TYPE_SLUG = "blouse";

type ProductTypeLike = {
  tags?: Array<{ name?: null | string; slug?: null | string }>;
  typeSlug?: null | string;
};

const normalized = (value: null | string | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export function isBlouseProduct(product: ProductTypeLike): boolean {
  const typeSlug = normalized(product.typeSlug);
  if (typeSlug) return typeSlug === BLOUSE_TYPE_SLUG;

  return Boolean(
    product.tags?.some((tag) => {
      const slug = normalized(tag.slug);
      const name = normalized(tag.name);
      return slug === BLOUSE_TYPE_SLUG || name === BLOUSE_TYPE_SLUG;
    }),
  );
}
