import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";

import { authMiddleware } from "@/api/hono/middleware/auth";
import {
  sameOriginCors,
  sameOriginMutationGuard,
} from "@/api/hono/middleware/same-origin";
import { registerAddressRoutes } from "@/api/hono/routes/addresses";
import { registerAdminDebugRoutes } from "@/api/hono/routes/admin-debug";
import { registerAuthOtpRoutes } from "@/api/hono/routes/auth-otp";
import { registerAgentChatRoutes } from "@/api/hono/routes/agent-chat";
import { registerAdminDashboardRoutes } from "@/api/hono/routes/admin-dashboard";
import { registerAdminImportRoutes } from "@/api/hono/routes/admin-import";
import { registerAdminOrderRoutes } from "@/api/hono/routes/admin-orders";
import { registerAdminDiscountRoutes } from "@/api/hono/routes/admin-discounts";
import {
  registerAdminContactSubmissionRoutes,
  registerContactRoutes,
} from "@/api/hono/routes/contact";
import { registerDiscountRoutes } from "@/api/hono/routes/discounts";
import { registerEventsRoutes } from "@/api/hono/routes/events";
import { registerNavigationRoutes } from "@/api/hono/routes/navigation";
import { registerPagesRoutes } from "@/api/hono/routes/pages";
import { registerRedirectsRoutes } from "@/api/hono/routes/redirects";
import { registerThemeRoutes } from "@/api/hono/routes/theme";
import { registerCartRoutes } from "@/api/hono/routes/cart";
import { registerCollectionRoutes } from "@/api/hono/routes/collections";
import { registerConversationRoutes } from "@/api/hono/routes/conversations";
import { registerCronRoutes } from "@/api/hono/routes/cron";
import { registerGlobalRoutes } from "@/api/hono/routes/globals";
import { registerGeoRoutes } from "@/api/hono/routes/geo";
import { registerMediaRoutes } from "@/api/hono/routes/media";
import { registerNewsletterRoutes } from "@/api/hono/routes/newsletter";
import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { registerProductRoutes } from "@/api/hono/routes/products";
import { registerProductTypeRoutes } from "@/api/hono/routes/product-types";
import { registerSearchRoutes } from "@/api/hono/routes/search";
import { registerSecurityRoutes } from "@/api/hono/routes/security";
import {
  registerAdminSiteFeedbackRoutes,
  registerSiteFeedbackRoutes,
} from "@/api/hono/routes/site-feedback";
import { registerSocialRoutes } from "@/api/hono/routes/social";
import { registerUserRoutes } from "@/api/hono/routes/users";
import { registerWishlistRoutes } from "@/api/hono/routes/wishlist";
import { registerWebhookRoutes } from "@/api/hono/routes/webhooks";
import { registerFeedsRoutes } from "@/api/hono/routes/feeds";
import { registerHealthRoutes } from "@/api/hono/routes/health";
import { registerTagRoutes } from "@/api/hono/routes/tags";
import type { HonoBindings } from "@/api/hono/types";
import { shouldExposeApiDocs } from "@/lib/http/api-docs-policy";
import { onUncaughtError } from "@/lib/http/on-uncaught-error";

const app = new OpenAPIHono<HonoBindings>().basePath("/api/v2");

app.use("*", async (c, next) => {
  c.set("perfStartedAt", performance.now());
  c.set("perfTimings", []);
  await next();
});
app.use("*", sameOriginCors);
app.use("*", sameOriginMutationGuard);
app.use("*", authMiddleware);

if (shouldExposeApiDocs()) {
  app.doc("/openapi.json", {
    info: {
      title: "FTT API v2",
      version: "1.0.0",
    },
    openapi: "3.1.0",
  });

  app.get("/docs", swaggerUI({ url: "/api/v2/openapi.json" }));
}

const productsApp = new OpenAPIHono<HonoBindings>();
registerProductRoutes(productsApp);
app.route("/products", productsApp);

const productTypesApp = new OpenAPIHono<HonoBindings>();
registerProductTypeRoutes(productTypesApp);
app.route("/product-types", productTypesApp);

const tagsApp = new OpenAPIHono<HonoBindings>();
registerTagRoutes(tagsApp);
app.route("/tags", tagsApp);

const collectionsApp = new OpenAPIHono<HonoBindings>();
registerCollectionRoutes(collectionsApp);
app.route("/collections", collectionsApp);

const ordersApp = new OpenAPIHono<HonoBindings>();
registerOrderRoutes(ordersApp);
app.route("/orders", ordersApp);

const usersApp = new OpenAPIHono<HonoBindings>();
registerUserRoutes(usersApp);
app.route("/users", usersApp);

const authOtpApp = new OpenAPIHono<HonoBindings>();
registerAuthOtpRoutes(authOtpApp);
app.route("/auth/otp", authOtpApp);

const addressesApp = new OpenAPIHono<HonoBindings>();
registerAddressRoutes(addressesApp);
app.route("/addresses", addressesApp);

const wishlistApp = new OpenAPIHono<HonoBindings>();
registerWishlistRoutes(wishlistApp);
app.route("/wishlist", wishlistApp);

const eventsApp = new OpenAPIHono<HonoBindings>();
registerEventsRoutes(eventsApp);
app.route("/events", eventsApp);

const mediaApp = new OpenAPIHono<HonoBindings>();
registerMediaRoutes(mediaApp);
app.route("/media", mediaApp);

const newsletterApp = new OpenAPIHono<HonoBindings>();
registerNewsletterRoutes(newsletterApp);
app.route("/newsletter", newsletterApp);

const contactApp = new OpenAPIHono<HonoBindings>();
registerContactRoutes(contactApp);
app.route("/contact", contactApp);

const siteFeedbackApp = new OpenAPIHono<HonoBindings>();
registerSiteFeedbackRoutes(siteFeedbackApp);
app.route("/site-feedback", siteFeedbackApp);

const searchApp = new OpenAPIHono<HonoBindings>();
registerSearchRoutes(searchApp);
app.route("/search", searchApp);

const geoApp = new OpenAPIHono<HonoBindings>();
registerGeoRoutes(geoApp);
app.route("/geo", geoApp);

const securityApp = new OpenAPIHono<HonoBindings>();
registerSecurityRoutes(securityApp);
app.route("/security", securityApp);

const socialApp = new OpenAPIHono<HonoBindings>();
registerSocialRoutes(socialApp);
app.route("/social", socialApp);

const globalsApp = new OpenAPIHono<HonoBindings>();
registerGlobalRoutes(globalsApp);
app.route("/globals", globalsApp);

const cartApp = new OpenAPIHono<HonoBindings>();
registerCartRoutes(cartApp);
app.route("/cart", cartApp);

const paymentsApp = new OpenAPIHono<HonoBindings>();
registerPaymentRoutes(paymentsApp);
app.route("/payments", paymentsApp);

const webhooksApp = new OpenAPIHono<HonoBindings>();
registerWebhookRoutes(webhooksApp);
app.route("/webhooks", webhooksApp);

const cronApp = new OpenAPIHono<HonoBindings>();
registerCronRoutes(cronApp);
app.route("/cron", cronApp);

const adminDashboardApp = new OpenAPIHono<HonoBindings>();
registerAdminDashboardRoutes(adminDashboardApp);
app.route("/admin/dashboard", adminDashboardApp);

const adminDebugApp = new OpenAPIHono<HonoBindings>();
registerAdminDebugRoutes(adminDebugApp);
app.route("/admin/debug", adminDebugApp);

const agentChatApp = new OpenAPIHono<HonoBindings>();
registerAgentChatRoutes(agentChatApp);
app.route("/admin/agent-chat", agentChatApp);

const adminImportApp = new OpenAPIHono<HonoBindings>();
registerAdminImportRoutes(adminImportApp);
app.route("/admin/import", adminImportApp);

const adminOrdersApp = new OpenAPIHono<HonoBindings>();
registerAdminOrderRoutes(adminOrdersApp);
app.route("/admin/orders", adminOrdersApp);

const adminDiscountsApp = new OpenAPIHono<HonoBindings>();
registerAdminDiscountRoutes(adminDiscountsApp);
app.route("/admin/discounts", adminDiscountsApp);

const adminContactSubmissionsApp = new OpenAPIHono<HonoBindings>();
registerAdminContactSubmissionRoutes(adminContactSubmissionsApp);
app.route("/admin/contact-submissions", adminContactSubmissionsApp);

const adminSiteFeedbackApp = new OpenAPIHono<HonoBindings>();
registerAdminSiteFeedbackRoutes(adminSiteFeedbackApp);
app.route("/admin/site-feedback", adminSiteFeedbackApp);

const discountsApp = new OpenAPIHono<HonoBindings>();
registerDiscountRoutes(discountsApp);
app.route("/discounts", discountsApp);

const adminPagesApp = new OpenAPIHono<HonoBindings>();
registerPagesRoutes(adminPagesApp);
app.route("/admin/pages", adminPagesApp);

const adminThemeApp = new OpenAPIHono<HonoBindings>();
registerThemeRoutes(adminThemeApp);
app.route("/admin/theme", adminThemeApp);

const adminNavigationApp = new OpenAPIHono<HonoBindings>();
registerNavigationRoutes(adminNavigationApp);
app.route("/admin/navigation", adminNavigationApp);

const adminRedirectsApp = new OpenAPIHono<HonoBindings>();
registerRedirectsRoutes(adminRedirectsApp);
app.route("/admin/redirects", adminRedirectsApp);

const conversationsApp = new OpenAPIHono<HonoBindings>();
registerConversationRoutes(conversationsApp);
app.route("/conversations", conversationsApp);

const feedsApp = new OpenAPIHono<HonoBindings>();
registerFeedsRoutes(feedsApp);
app.route("/feeds", feedsApp);

const healthApp = new OpenAPIHono<HonoBindings>();
registerHealthRoutes(healthApp);
app.route("/health", healthApp);

app.onError(onUncaughtError);

export default app;
