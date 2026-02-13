import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

/**
 * POST /api/cron/release-reservations
 *
 * Releases expired product reservations.  Products that have
 * stockStatus = "reserved" and reservedUntil < now are set back
 * to "available".
 *
 * Designed to be called by an external cron scheduler (Vercel Cron,
 * Upstash QStash, GitHub Actions, etc.) every 5–10 minutes.
 *
 * Protected by a shared secret in the Authorization header.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return errorResponse(
        500,
        "CRON_SECRET is not configured.",
        "CRON_SECRET_MISSING"
      );
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse(401, "Invalid cron secret.", "UNAUTHORIZED");
    }

    const payload = await getPayloadClient();

    // Find all products that have an expired reservation
    const now = new Date().toISOString();
    const expired = await payload.find({
      collection: "products",
      where: {
        and: [
          { stockStatus: { equals: "reserved" } },
          { reservedUntil: { less_than: now } },
        ],
      },
      limit: 100,
      overrideAccess: true,
    });

    let released = 0;
    for (const product of expired.docs) {
      await payload.update({
        collection: "products",
        id: product.id,
        data: {
          stockStatus: "available",
          reservedUntil: null,
        } as Record<string, unknown>,
        overrideAccess: true,
      });
      released++;
    }

    return NextResponse.json({
      ok: true,
      released,
      checked: expired.totalDocs,
      timestamp: now,
    });
  } catch {
    return errorResponse(
      500,
      "Failed to release reservations.",
      "CRON_FAILED"
    );
  }
}
