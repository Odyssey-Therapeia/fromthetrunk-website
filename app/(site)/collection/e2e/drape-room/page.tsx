import { notFound } from "next/navigation";

import { DrapeRoomTrigger } from "@/components/drape-room/drape-room-trigger";
import { ProductCard } from "@/components/product/product-card";
import type { DrapeSaree } from "@/lib/drape-room/product";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";

const E2E_SAREE: DrapeSaree = {
  productId: "11111111-1111-4111-8111-111111111111",
  productSlug: "e2e-classic-nivi-saree",
  productName: "E2E Classic Nivi Saree",
  fabric: "Silk",
  pricePaise: 125_000,
  originalPricePaise: 150_000,
  stockStatus: "available",
  displayImageUrl: "/Ftt_logo_navbar.avif",
  productImageId: "22222222-2222-4222-8222-222222222222",
  productReferenceVersion: "e2e-product-reference-v1",
};

const E2E_TIMESTAMP = new Date("2026-08-26T00:00:00.000Z");
const E2E_MEDIA_HOST =
  "njufw8f4mlcjsl7g.public.blob.vercel-storage.com";
const E2E_SOURCE_HASH = "a".repeat(64);

const E2E_PRODUCT: Product = {
  id: E2E_SAREE.productId,
  name: E2E_SAREE.productName,
  slug: E2E_SAREE.productSlug,
  collectionId: null,
  artisanId: null,
  pricePaise: E2E_SAREE.pricePaise,
  originalPricePaise: 150_000,
  featured: false,
  status: "published",
  stockStatus: "available",
  reservedUntil: null,
  soldAt: null,
  quantityAvailable: 1,
  storyTitle: "A deterministic saree for local browser verification",
  storyNarrative: null,
  storyProvenance: null,
  storyEra: null,
  detailsFabric: E2E_SAREE.fabric,
  detailsLength: null,
  detailsWidth: null,
  detailsCondition: "Excellent",
  detailsDesigner: null,
  typeId: null,
  attributes: {},
  metadata: null,
  createdAt: E2E_TIMESTAMP,
  updatedAt: E2E_TIMESTAMP,
  collection: null,
  tags: [],
  typeName: "Saree",
  typeSlug: "saree",
  images: [
    {
      sortOrder: 0,
      media: {
        id: E2E_SAREE.productImageId,
        key: "e2e/drape-room-source.webp",
        url: `https://${E2E_MEDIA_HOST}/media/e2e/drape-room-source.webp`,
        filename: "drape-room-source.webp",
        alt: E2E_SAREE.productName,
        mimeType: "image/webp",
        filesize: 500_000,
        width: 1_600,
        height: 2_133,
        blurDataUrl: null,
        metadata: null,
        createdAt: E2E_TIMESTAMP,
        updatedAt: E2E_TIMESTAMP,
        derivativeDeliveryActive: true,
        derivatives: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            mediaAssetId: E2E_SAREE.productImageId,
            role: "card",
            objectKey: "media/e2e/drape-room-card-v1.webp",
            url: `https://${E2E_MEDIA_HOST}/media/e2e/drape-room-card-v1.webp`,
            mimeType: "image/webp",
            byteSize: 150_000,
            width: 800,
            height: 1_067,
            generationVersion: 1,
            sourceHash: E2E_SOURCE_HASH,
            sourceUpdatedAt: E2E_TIMESTAMP,
            status: "ready",
            failureReason: null,
            createdAt: E2E_TIMESTAMP,
            updatedAt: E2E_TIMESTAMP,
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            mediaAssetId: E2E_SAREE.productImageId,
            role: "pdp",
            objectKey: "media/e2e/drape-room-pdp-v1.webp",
            url: `https://${E2E_MEDIA_HOST}/media/e2e/drape-room-pdp-v1.webp`,
            mimeType: "image/webp",
            byteSize: 400_000,
            width: 1_600,
            height: 2_133,
            generationVersion: 1,
            sourceHash: E2E_SOURCE_HASH,
            sourceUpdatedAt: E2E_TIMESTAMP,
            status: "ready",
            failureReason: null,
            createdAt: E2E_TIMESTAMP,
            updatedAt: E2E_TIMESTAMP,
          },
        ],
      },
    },
  ],
};

export default function DrapeRoomE2EPage() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.FTT_DRAPE_ROOM_E2E !== "true"
  ) {
    notFound();
  }

  return (
    <div className="mx-auto min-h-[70vh] max-w-6xl px-5 py-16 sm:px-8">
      <h1 className="font-heading text-3xl text-ftt-navy">
        Drape Room E2E harness
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ftt-burgundy/70">
        Real shared storefront entry controls with deterministic local product
        data. This page is unavailable in production.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[20rem_1fr]">
        <section aria-label="Product card entry" className="min-w-0">
          <h2 className="mb-4 font-serif text-2xl text-ftt-navy">
            Product card entry
          </h2>
          <ProductCard product={E2E_PRODUCT} />
        </section>

        <div className="grid content-start gap-8">
          <section
            aria-label="PDP desktop entry"
            className="rounded-3xl border border-ftt-border bg-ftt-card p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ftt-burgundy/65">
              PDP desktop action
            </p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="font-serif text-2xl text-ftt-navy">
                {E2E_SAREE.productName}
              </span>
              <DrapeRoomTrigger product={E2E_SAREE} />
            </div>
          </section>

          <section
            aria-label="PDP mobile sticky entry"
            className="sticky bottom-3 rounded-3xl border border-ftt-gold/35 bg-ftt-ivory/95 p-4 shadow-xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-ftt-navy">
                PDP mobile sticky action
              </span>
              <DrapeRoomTrigger product={E2E_SAREE} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
