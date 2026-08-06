import { head, put } from "@vercel/blob";

import type { DerivativeBlobStore } from "@/lib/media/derivative-generator";
import { DerivativeGenerationError } from "@/lib/media/derivative-generator";
import { isApprovedDerivativeDestinationUrl } from "@/lib/media/derivative-policy";

export const vercelDerivativeBlobStore: DerivativeBlobStore = {
  async uploadImmutable({ body, contentType, objectKey }) {
    const token = process.env.FTT_MEDIA_DERIVATIVE_BLOB_TOKEN;
    const destinationHost =
      process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST?.trim();
    if (!token || !destinationHost) {
      throw new DerivativeGenerationError("missing_destination_configuration");
    }

    let uploaded;
    try {
      uploaded = await put(objectKey, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
        contentType,
        token,
      });
    } catch {
      // Reconcile a prior successful immutable upload whose DB save failed.
      try {
        const existing = await head(objectKey, { token });
        if (
          existing.size === body.byteLength &&
          existing.pathname === objectKey &&
          existing.contentType === contentType &&
          isApprovedDerivativeDestinationUrl(existing.url)
        ) {
          return { byteSize: existing.size, url: existing.url };
        }
      } catch {
        // The original upload failure is reported below without leaking details.
      }
      throw new DerivativeGenerationError("upload_failed");
    }

    if (!isApprovedDerivativeDestinationUrl(uploaded.url)) {
      throw new DerivativeGenerationError("unapproved_derivative_url");
    }

    let verified;
    try {
      verified = await head(uploaded.url, { token });
    } catch {
      throw new DerivativeGenerationError("upload_verification_failed");
    }
    if (
      verified.size !== body.byteLength ||
      verified.pathname !== objectKey ||
      verified.contentType !== contentType ||
      !isApprovedDerivativeDestinationUrl(verified.url)
    ) {
      throw new DerivativeGenerationError("upload_verification_failed");
    }

    return { byteSize: verified.size, url: uploaded.url };
  },
};
