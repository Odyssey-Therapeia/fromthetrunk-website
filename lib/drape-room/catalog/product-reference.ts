import { getProduct } from "@/db/queries/products";
import {
  projectDrapeSaree,
  resolveDrapeProductReferences,
  type DrapeSaree,
  type DrapeProductReferenceSource,
} from "@/lib/drape-room/product";
import { MAX_PRODUCT_SOURCE_BYTES } from "@/lib/drape-room/server/image-limits";
import {
  observeTryonFailure,
  observeTryonRejection,
  observeTryonStage,
} from "@/lib/drape-room/server/observability";

const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FETCH_TIMEOUT_MS = 12_000;

export type AuthoritativeTryonProduct = {
  saree: DrapeSaree;
  references:
    | [LoadedAuthoritativeReference]
    | [LoadedAuthoritativeReference, LoadedAuthoritativeReference];
};

export type TryonProductFailure =
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "PRODUCT_NOT_ELIGIBLE"
  | "PRODUCT_REFERENCE_UNAVAILABLE";

export class TryonProductError extends Error {
  constructor(readonly code: TryonProductFailure) {
    super(code);
    this.name = "TryonProductError";
  }
}

/** Resolve the paid request's product and approved reference server-side. */
export async function loadAuthoritativeTryonProduct(
  productId: string,
  fetchImpl: typeof fetch = fetch,
  invocationSignal?: AbortSignal,
): Promise<AuthoritativeTryonProduct> {
  let stage = "catalogue_product_id";
  observeTryonStage("catalogue_lookup_started", { productId });
  if (!PRODUCT_ID_PATTERN.test(productId)) {
    observeTryonRejection(stage, "PRODUCT_NOT_FOUND", 404);
    throw new TryonProductError("PRODUCT_NOT_FOUND");
  }
  stage = "catalogue_database_lookup";
  let product: Awaited<ReturnType<typeof getProduct>>;
  try {
    product = await getProduct(productId);
  } catch (error) {
    observeTryonFailure(stage, error, { productId });
    throw error;
  }
  if (!product) {
    observeTryonRejection(stage, "PRODUCT_NOT_FOUND", 404, { productId });
    throw new TryonProductError("PRODUCT_NOT_FOUND");
  }
  observeTryonStage("catalogue_product_loaded", {
    productId,
    productStatus: product.status,
    referenceCount: product.images.length,
    stockStatus: product.stockStatus,
  });

  stage = "catalogue_eligibility";
  const projection = projectDrapeSaree(product);
  if (!projection.eligible) {
    const code =
      projection.reason === "unavailable"
        ? "PRODUCT_UNAVAILABLE"
        : projection.reason === "missing_reference" ||
            projection.reason === "unapproved_reference"
          ? "PRODUCT_REFERENCE_UNAVAILABLE"
          : "PRODUCT_NOT_ELIGIBLE";
    observeTryonRejection(stage, code, code === "PRODUCT_UNAVAILABLE" ? 409 : 422, {
      productId,
      projectionReason: projection.reason,
    });
    throw new TryonProductError(code);
  }

  stage = "catalogue_reference_resolution";
  const referenceSet = resolveDrapeProductReferences(product);
  if (
    !referenceSet ||
    referenceSet.version !== projection.saree.productReferenceVersion
  ) {
    observeTryonRejection(stage, "PRODUCT_REFERENCE_UNAVAILABLE", 422, {
      productId,
      projectionReferenceVersion: projection.saree.productReferenceVersion,
      resolvedReferenceVersion: referenceSet?.version ?? null,
    });
    throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
  }
  const selected = referenceSet.references;
  selected.forEach((reference, index) =>
    observeTryonStage(
      "catalogue_reference_selected",
      {
        expectedBytes: reference.byteSize,
        expectedHeight: reference.height,
        expectedMimeType: reference.mimeType,
        expectedWidth: reference.width,
        mediaId: reference.mediaId,
        referenceHost: new URL(reference.url).hostname,
        referenceKind: reference.kind,
        referencePosition: index + 2,
        referenceVersion: reference.version,
      },
    ),
  );

  let primaryLoaded: LoadedAuthoritativeReference | null = null;
  try {
    stage = "catalogue_reference_fetch";
    primaryLoaded = await fetchAuthoritativeReference(
      referenceSet.primary,
      2,
      fetchImpl,
      invocationSignal,
    );
    if (referenceSet.mode === "single") {
      return {
        saree: projection.saree,
        references: [primaryLoaded],
      };
    }
    const detail = await fetchAuthoritativeReference(
      referenceSet.detail,
      3,
      fetchImpl,
      invocationSignal,
    );
    return {
      saree: projection.saree,
      references: [primaryLoaded, detail],
    };
  } catch (error) {
    primaryLoaded?.bytes.fill(0);
    if (error instanceof TryonProductError) {
      observeTryonRejection(stage, error.code, 422, { productId });
      throw error;
    }
    observeTryonFailure(stage, error, { productId });
    throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
  }
}

type LoadedAuthoritativeReference = {
  bytes: Uint8Array;
  mimeType: string;
  version: string;
};

async function fetchAuthoritativeReference(
  reference: DrapeProductReferenceSource,
  referencePosition: 2 | 3,
  fetchImpl: typeof fetch,
  invocationSignal?: AbortSignal,
): Promise<LoadedAuthoritativeReference> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const cancelForInvocation = () => controller.abort(invocationSignal?.reason);
  if (invocationSignal?.aborted) cancelForInvocation();
  else
    invocationSignal?.addEventListener("abort", cancelForInvocation, {
      once: true,
    });
  try {
    observeTryonStage("catalogue_reference_fetch_started", {
      expectedBytes: reference.byteSize,
      referenceHost: new URL(reference.url).hostname,
      referenceKind: reference.kind,
      referencePosition,
    });
    const response = await fetchImpl(reference.url, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || response.url !== reference.url) {
      throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
    }

    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : null;
    if (
      contentLength !== null &&
      (!Number.isFinite(contentLength) ||
        contentLength <= 0 ||
        contentLength !== reference.byteSize ||
        contentLength > MAX_PRODUCT_SOURCE_BYTES)
    ) {
      throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
    }
    const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (!mimeType || mimeType !== reference.mimeType) {
      throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
    }

    const bytes = await readBoundedBody(
      response,
      MAX_PRODUCT_SOURCE_BYTES,
      controller.signal,
    );
    if (bytes.byteLength !== reference.byteSize) {
      bytes.fill(0);
      throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
    }
    observeTryonStage(
      "catalogue_reference_body_verified",
      { actualBytes: bytes.byteLength, referencePosition },
    );
    return { bytes, mimeType, version: reference.version };
  } finally {
    clearTimeout(timeout);
    invocationSignal?.removeEventListener("abort", cancelForInvocation);
  }
}

async function readBoundedBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelForAbort = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  if (signal.aborted) cancelForAbort();
  else signal.addEventListener("abort", cancelForAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) {
        throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
      }
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
      }
      chunks.push(value);
    }
    if (total === 0) throw new TryonProductError("PRODUCT_REFERENCE_UNAVAILABLE");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancelForAbort);
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}
