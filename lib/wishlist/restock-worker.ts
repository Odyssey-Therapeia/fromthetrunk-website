/**
 * Sends the "it is back" email for restock requests.
 *
 * Three guarantees shape this, in order of how badly getting them wrong would
 * read to a shopper:
 *
 *   1. Never concurrently twice. Rows are claimed atomically with SKIP LOCKED,
 *      and provider idempotency protects recovery after a crashed run.
 *   2. Never early. A piece must have stayed free for the stabilisation window
 *      before anyone is told — a hold released and immediately retaken by the
 *      same buyer is not news.
 *   3. Never stale. Availability is checked once more immediately before the
 *      send, because the piece can go in the seconds between claim and send.
 */

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { products } from "@/db/schema";
import {
  claimRestockRequests,
  markRestockRequestNotified,
  releaseRestockRequest,
  RESTOCK_STABILISATION_MS,
} from "@/db/queries/wishlist";
import { sendEmail } from "@/lib/email/send";
import { restockAvailableEmail } from "@/lib/email/templates";
import { createLogger } from "@/lib/log";

const restockLog = createLogger("wishlist:restock-worker");

export type RestockRunSummary = {
  claimed: number;
  notified: number;
  /** Claimed, then found gone again before the email left. Not a failure. */
  skipped: number;
  failed: number;
};

/**
 * Is the piece still free, and has it stayed free for the whole stabilisation
 * window, right now? The claim applied the same rule, but a piece can be taken
 * and released again between the claim and the send.
 */
async function isStillAvailable(
  productId: string,
  now = new Date(),
): Promise<boolean> {
  const [row] = await withRetry(() =>
    db
      .select({
        reservedUntil: products.reservedUntil,
        status: products.status,
        stockStatus: products.stockStatus,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1),
  );
  if (!row) return false;

  const settledAt = row.updatedAt ? new Date(row.updatedAt).getTime() : Number.NaN;
  return (
    row.stockStatus === "available" &&
    row.status === "published" &&
    row.reservedUntil == null &&
    Number.isFinite(settledAt) &&
    settledAt <= now.getTime() - RESTOCK_STABILISATION_MS
  );
}

/**
 * A retry of one claimed row must be the same provider operation, while a new
 * subscription by the same shopper must be the same operation. Active
 * re-registration preserves created_at, while a deliberate new cycle after a
 * notified/failed row receives a new created_at. That timestamp is therefore
 * the request version without another id. The address is hashed rather than
 * copied into provider metadata or logs.
 */
const restockIdempotencyKey = (request: {
  email: string;
  productId: string;
  requestVersion: string;
}) =>
  `restock-${createHash("sha256")
    .update(`${request.productId}\n${request.email.toLowerCase()}\n${request.requestVersion}`)
    .digest("hex")}`;

export async function runRestockNotifications(
  limit = 50,
): Promise<RestockRunSummary> {
  const claimed = await claimRestockRequests(limit);
  const summary: RestockRunSummary = {
    claimed: claimed.length,
    failed: 0,
    notified: 0,
    skipped: 0,
  };

  for (const request of claimed) {
    // Each row stands alone: one row's database error must not strand the
    // rest of the batch as claimed until their lease runs out.
    let availabilityConfirmed = false;
    let sent = false;

    try {
      // The window closed between the claim and here often enough to matter:
      // one-of-one pieces move fast once they are free.
      if (!(await isStillAvailable(request.productId))) {
        await releaseRestockRequest(
          request.productId,
          request.email,
          request.claimedAt,
          { reason: null, retryable: false },
        );
        summary.skipped += 1;
        continue;
      }
      availabilityConfirmed = true;

      const { html, subject } = restockAvailableEmail({
        productName: request.productName,
        productSlug: request.productSlug,
      });
      sent = await sendEmail({
        html,
        idempotencyKey: restockIdempotencyKey(request),
        subject,
        to: request.recipientEmail,
      });

      if (!sent) {
        await releaseRestockRequest(
          request.productId,
          request.email,
          request.claimedAt,
          { reason: "send_rejected", retryable: true },
        );
        summary.failed += 1;
        continue;
      }

      const recorded = await withRetry(() =>
        markRestockRequestNotified(
          request.productId,
          request.email,
          request.claimedAt,
        ),
      );
      if (recorded) summary.notified += 1;
      else summary.failed += 1;
    } catch {
      summary.failed += 1;

      if (sent) {
        // The email has left. Handing the row back to the queue would mail
        // the shopper again on the next run, so it stays claimed: only an
        // expired lease can retry it, under the same provider idempotency key.
        restockLog.error("restock_record_failed", {
          productId: request.productId,
        });
        continue;
      }

      // The reason stays a short code: this column is read in logs and must
      // never carry a provider payload or the recipient's address. Nothing
      // was attempted before the recheck finished, so that failure costs the
      // subscription no attempt.
      try {
        await releaseRestockRequest(
          request.productId,
          request.email,
          request.claimedAt,
          availabilityConfirmed
            ? { reason: "send_threw", retryable: true }
            : { reason: "recheck_threw", retryable: false },
        );
      } catch {
        // The claim lease hands the row to a later run.
        restockLog.error("restock_release_failed", {
          productId: request.productId,
        });
      }
    }
  }

  return summary;
}
