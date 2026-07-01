import type { Product } from "@/types/domain";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { absoluteUrl } from "@/lib/seo/site-url";

const UNSAFE_IMAGE_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function toSeoImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;

  try {
    const url = new URL(absoluteUrl(src));
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "https:") return null;
    if (UNSAFE_IMAGE_HOSTS.has(hostname)) return null;
    if (hostname.endsWith(".vercel.app")) return null;

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function productSeoImageUrls(product: Pick<Product, "images">): string[] {
  const urls = (product.images ?? [])
    .map((entry) => resolveMediaURL(entry as unknown))
    .map(toSeoImageUrl)
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls));
}
