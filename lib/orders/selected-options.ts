import {
  getAvailableBlouseSizes,
  normalizeBlouseSize,
  type SelectedOptions,
} from "@/lib/catalog/blouse-size-chart";
import { isBlouseProduct } from "@/lib/products/product-type";

type ProductForSelectedOptions = {
  attributes?: null | Record<string, unknown>;
  id: string;
  name: string;
  typeSlug?: null | string;
};

type SelectedOptionsInput = {
  size?: string;
};

export type SelectedOptionsValidationError = {
  code: "BLOUSE_SIZE_INVALID" | "BLOUSE_SIZE_REQUIRED";
  details: {
    productId: string;
    productName: string;
  };
  message: string;
};

export function validateOrderItemSelectedOptions({
  product,
  selectedOptions,
}: {
  product: ProductForSelectedOptions;
  selectedOptions?: SelectedOptionsInput;
}): { error: SelectedOptionsValidationError } | { selectedOptions: SelectedOptions } {
  if (!isBlouseProduct(product)) {
    return { selectedOptions: {} };
  }

  const selectedSize = normalizeBlouseSize(selectedOptions?.size);
  if (!selectedSize) {
    return {
      error: {
        code: "BLOUSE_SIZE_REQUIRED",
        details: {
          productId: product.id,
          productName: product.name,
        },
        message: "Please select a blouse size before checkout.",
      },
    };
  }

  const availableSizes = getAvailableBlouseSizes(product);
  if (!availableSizes.includes(selectedSize)) {
    return {
      error: {
        code: "BLOUSE_SIZE_INVALID",
        details: {
          productId: product.id,
          productName: product.name,
        },
        message: "The selected blouse size is not available for this piece.",
      },
    };
  }

  return { selectedOptions: { size: selectedSize } };
}

export function formatSelectedOptions(options: unknown): string | null {
  if (!options || typeof options !== "object") return null;
  const size = normalizeBlouseSize((options as SelectedOptionsInput).size);
  return size ? `Size: ${size}` : null;
}
