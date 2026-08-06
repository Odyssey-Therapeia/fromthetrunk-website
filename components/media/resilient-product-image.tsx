"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

const PRODUCT_IMAGE_PLACEHOLDER = "/404/Broken_Missing_Product_Image.avif";

type ResilientProductImageProps = Omit<ImageProps, "onError"> & {
  onError?: ImageProps["onError"];
};

/**
 * A bounded one-shot fallback for customer-visible product media.
 *
 * The requested source still goes through Next Image. If that optimized request
 * fails, the image swaps once to a small local asset without retrying the remote
 * source or changing the reserved layout box.
 */
export function ResilientProductImage({
  alt,
  onError,
  src,
  ...props
}: ResilientProductImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const sourceKey =
    typeof src === "string"
      ? src
      : "default" in src
        ? src.default.src
        : src.src;
  const failed = failedSource === sourceKey;

  return (
    <Image
      {...props}
      alt={alt}
      src={failed ? PRODUCT_IMAGE_PLACEHOLDER : src}
      onError={(event) => {
        onError?.(event);
        if (!failed) setFailedSource(sourceKey);
      }}
    />
  );
}
