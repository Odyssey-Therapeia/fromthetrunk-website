import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { expireCommerceHoldsForProducts } from "@/db/queries/user-cart";
import { sendReservationExpiryReminders } from "@/db/queries/reservation-reminders";
import { upsertChannelMetric } from "@/db/queries/channel-metrics";
import { getChannelMetrics, getEventCounts } from "@/db/queries/control-centre";
import { products } from "@/db/schema";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { emitAnalyticsEvent } from "@/lib/analytics/emit";
import { revalidateProductsCache } from "@/lib/cache/product-cache";
import { pullAllMetrics } from "@/lib/ports/channel-metrics";
import { composeDashboard } from "@/lib/control-centre/compose-dashboard";
import { sendEmail } from "@/lib/email/send";
import { getOrderNotificationRecipients } from "@/lib/email/recipients";
import { weeklyOpsDigestEmail } from "@/lib/email/templates";
import { createLogger } from "@/lib/log";
import {
  reconcileExpiredPaymentHolds,
  type ExpiredPaymentHoldReconciliation,
} from "@/lib/payments/reconcile-expired-holds";

import {
  runRestockNotifications,
  type RestockRunSummary,
} from "@/lib/wishlist/restock-worker";

const log = createLogger("cron:channel-metrics");
const releaseLog = createLogger("cron:release-reservations");

/* Mail shares the release invocation with Razorpay calls, so each run is bounded. */
const RESTOCK_NOTIFICATIONS_PER_RUN = 20;

const emptyPaymentReconciliation = (): ExpiredPaymentHoldReconciliation => ({
  checked: 0,
  completedOrderIds: [],
  conflictOrderIds: [],
  deferredOrderIds: [],
  protectedProductIds: [],
  releasedOrderIds: [],
  releasedProductIds: [],
  releasedSlugs: [],
  restoredProductIds: [],
  restoredSlugs: [],
});

export const registerCronRoutes = (app: OpenAPIHono<HonoBindings>) => {
  /*
   * Tells shoppers a piece they asked about is available again.
   *
   * Deliberately not fired from the release route: releasing a saree must stay
   * fast and must not depend on an email provider. This run picks the work up
   * afterwards, once the piece has proved it is genuinely free.
   */
  app.openapi(
    createRoute({
      method: "get",
      path: "/send-restock-notifications",
      responses: {
        200: { description: "Restock notifications processed" },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500,
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          { code: "UNAUTHORIZED", message: "Invalid cron secret." },
          401,
        );
      }

      const summary = await runRestockNotifications();
      return c.json(summary, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/release-reservations",
      responses: {
        200: {
          description: "Released expired reservations",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      const now = new Date();
      const expiredRows = await db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(
          and(
            eq(products.stockStatus, "reserved"),
            isNotNull(products.reservedUntil),
            lt(products.reservedUntil, now)
          )
        );

      const expiredIds = expiredRows.map((row) => row.id);
      /*
       * Payment holds are never released by the local clock alone. This job
       * and terminal Payment Link webhooks consult Razorpay, and both delegate
       * any verified completion/release to the exact atomic commerce commands.
       * A failure here leaves those holds protected (ordinary expiry below
       * skips them), so expiry and restock mail still run.
       */
      let paymentReconciliation: ExpiredPaymentHoldReconciliation =
        emptyPaymentReconciliation();
      let paymentReconciliationFailed = false;
      try {
        paymentReconciliation = await reconcileExpiredPaymentHolds({
          now,
          productIds: expiredIds,
        });
      } catch (error) {
        paymentReconciliationFailed = true;
        releaseLog.error("Payment hold reconciliation failed", { err: error });
      }
      const expiry = await expireCommerceHoldsForProducts(expiredIds, now);
      const releasedIds = [
        ...new Set([
          ...paymentReconciliation.releasedProductIds,
          ...expiry.releasedProductIds,
        ]),
      ];
      const ordinaryReleasedSet = new Set(expiry.ordinaryReleasedProductIds);
      const ordinaryReleasedRows = expiredRows.filter((row) =>
        ordinaryReleasedSet.has(row.id),
      );
      // A hold restored to its cart deadline changes the storefront as much
      // as a release does.
      const changedSlugs = [
        ...new Set([
          ...paymentReconciliation.releasedSlugs,
          ...paymentReconciliation.restoredSlugs,
          ...ordinaryReleasedRows.map((row) => row.slug),
        ]),
      ];
      if (changedSlugs.length > 0) {
        revalidateProductsCache(changedSlugs);
      }

      // Fire-and-forget: reservation_expired event per expired product.
      // emitAnalyticsEvent() never throws; errors are caught + logged inside.
      for (const productId of releasedIds) {
        void emitAnalyticsEvent({
          event_id: crypto.randomUUID(),
          type: "reservation_expired",
          payload: { productId },
          occurredAt: now,
        });
      }

      /* Reuse this scheduled invocation for mail work. Fresh releases are
       * intentionally skipped by the worker's stability window and become
       * eligible on the next run; no second production cron is necessary.
       * A mail failure must not hide the inventory work already committed. */
      let restockNotifications: RestockRunSummary | { error: string };
      try {
        restockNotifications = await runRestockNotifications(
          RESTOCK_NOTIFICATIONS_PER_RUN,
        );
      } catch (error) {
        releaseLog.error("Restock notification run failed", { err: error });
        restockNotifications = { error: "RESTOCK_WORKER_FAILED" };
      }

      return c.json(
        {
          checked: expiredRows.length,
          ok: true,
          released: releasedIds.length,
          paymentHoldsRestored:
            paymentReconciliation.restoredProductIds.length,
          paymentReconciliationFailed,
          paymentReleaseConflicts:
            paymentReconciliation.conflictOrderIds.length,
          paymentReleasesDeferred:
            paymentReconciliation.deferredOrderIds.length,
          paymentsCompleted:
            paymentReconciliation.completedOrderIds.length,
          reservationsExpired:
            paymentReconciliation.releasedProductIds.length,
          restockNotifications,
          timestamp: new Date().toISOString(),
        },
        200
      );
    }
  );

  // ── P5-04: Refresh channel metrics cache ──────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/refresh-channel-metrics",
      responses: {
        200: {
          description: "Channel metrics refreshed and cached",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      // Pull all 4 adapters in parallel — error-isolated, never throws.
      const metrics = await pullAllMetrics();

      const fetchedAt = new Date();

      // Upsert each adapter's metrics into channel_metrics.
      // Each upsert is wrapped individually so a DB failure on one does NOT
      // block the others (mirrors the analytics-sink fire-and-forget isolation).
      const adapterStatus: Record<string, string> = {};

      const upsertResults = await Promise.allSettled([
        upsertChannelMetric({
          source: "search-console",
          metricKey: "metrics",
          value: metrics.searchConsole as unknown as Record<string, unknown>,
          fetchedAt,
        }),
        upsertChannelMetric({
          source: "ga4-data",
          metricKey: "metrics",
          value: metrics.ga4Data as unknown as Record<string, unknown>,
          fetchedAt,
        }),
        upsertChannelMetric({
          source: "vercel-insights",
          metricKey: "metrics",
          value: metrics.vercelInsights as unknown as Record<string, unknown>,
          fetchedAt,
        }),
        upsertChannelMetric({
          source: "meta-marketing",
          metricKey: "metrics",
          value: metrics.metaMarketing as unknown as Record<string, unknown>,
          fetchedAt,
        }),
      ]);

      const adapterNames = ["searchConsole", "ga4Data", "vercelInsights", "metaMarketing"] as const;

      for (let i = 0; i < upsertResults.length; i++) {
        const result = upsertResults[i];
        const name = adapterNames[i]!;
        if (result.status === "fulfilled") {
          adapterStatus[name] = "ok";
        } else {
          adapterStatus[name] = "error";
          log.error("[channel-metrics cron] upsert failed", {
            adapter: name,
            err: result.reason as Record<string, unknown>,
          });
        }
      }

      return c.json(
        {
          ok: true,
          adapters: adapterStatus,
          timestamp: fetchedAt.toISOString(),
        },
        200
      );
    }
  );

  // ── P5-07: Reservation-expiry reminder emails ─────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/send-reservation-expiry-reminders",
      responses: {
        200: {
          description:
            "Sent reservation-expiry reminder emails to eligible abandoned checkouts",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      const result = await sendReservationExpiryReminders();

      return c.json(
        {
          ok: true,
          sent: result.sent,
          skippedSold: result.skippedSold,
          skippedNoEmail: result.skippedNoEmail,
          errors: result.errors,
          timestamp: new Date().toISOString(),
        },
        200
      );
    }
  );

  // ── P6-07: Weekly ops digest email ───────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/weekly-ops-digest",
      responses: {
        200: {
          description: "Weekly operations digest email sent (or skipped on send error)",
        },
        401: {
          description: "Unauthorized — invalid or missing cron secret",
        },
        500: {
          description: "CRON_SECRET not configured",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

      // Compose the REAL dashboard from live data (both functions never throw).
      const [channelMetrics, eventCounts] = await Promise.all([
        getChannelMetrics(),
        getEventCounts(),
      ]);

      const dashboard = composeDashboard({
        ga4: channelMetrics.ga4,
        searchConsole: channelMetrics.searchConsole,
        vercelInsights: channelMetrics.vercelInsights,
        metaMarketing: channelMetrics.metaMarketing,
        eventCounts,
      });

      const { subject, html } = weeklyOpsDigestEmail(dashboard);
      const recipients = getOrderNotificationRecipients();

      // Fire-and-forget: a failing send does NOT crash the cron.
      // Returns 200 regardless — the send failure is logged but not propagated.
      let emailOk = false;
      try {
        emailOk = await sendEmail({ to: recipients, subject, html });
      } catch (err) {
        log.error("[weekly-ops-digest cron] sendEmail threw", {
          err: err as Record<string, unknown>,
        });
      }

      return c.json(
        {
          ok: true,
          emailSent: emailOk,
          recipients,
          timestamp: new Date().toISOString(),
        },
        200
      );
    }
  );
};
