import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";

import { authMiddleware } from "@/api/hono/middleware/auth";
import { registerAddressRoutes } from "@/api/hono/routes/addresses";
import { registerCartRoutes } from "@/api/hono/routes/cart";
import { registerCollectionRoutes } from "@/api/hono/routes/collections";
import { registerConversationRoutes } from "@/api/hono/routes/conversations";
import { registerDiscountRoutes } from "@/api/hono/routes/discounts";
import { registerFeedsRoutes } from "@/api/hono/routes/feeds";
import { registerGlobalRoutes } from "@/api/hono/routes/globals";
import { registerHealthRoutes } from "@/api/hono/routes/health";
import { registerMediaRoutes } from "@/api/hono/routes/media";
import { registerNewsletterRoutes } from "@/api/hono/routes/newsletter";
import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { registerProductRoutes } from "@/api/hono/routes/products";
import { registerProductTypeRoutes } from "@/api/hono/routes/product-types";
import { registerSearchRoutes } from "@/api/hono/routes/search";
import { registerTagRoutes } from "@/api/hono/routes/tags";
import { registerUserRoutes } from "@/api/hono/routes/users";
import { registerWebhookRoutes } from "@/api/hono/routes/webhooks";
import { registerWishlistRoutes } from "@/api/hono/routes/wishlist";
import type { HonoBindings } from "@/api/hono/types";
import { onUncaughtError } from "@/lib/http/on-uncaught-error";

const app = new OpenAPIHono<HonoBindings>().basePath("/api/v2");

app.use("*", cors());
app.use("*", authMiddleware);

app.doc("/openapi.json", {
  info: {
    title: "FTT Website API v2",
    version: "1.0.0",
  },
  openapi: "3.1.0",
});

app.get("/docs", swaggerUI({ url: "/api/v2/openapi.json" }));

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

const addressesApp = new OpenAPIHono<HonoBindings>();
registerAddressRoutes(addressesApp);
app.route("/addresses", addressesApp);

const wishlistApp = new OpenAPIHono<HonoBindings>();
registerWishlistRoutes(wishlistApp);
app.route("/wishlist", wishlistApp);

const mediaApp = new OpenAPIHono<HonoBindings>();
registerMediaRoutes(mediaApp);
app.route("/media", mediaApp);

const newsletterApp = new OpenAPIHono<HonoBindings>();
registerNewsletterRoutes(newsletterApp);
app.route("/newsletter", newsletterApp);

const searchApp = new OpenAPIHono<HonoBindings>();
registerSearchRoutes(searchApp);
app.route("/search", searchApp);

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

const discountsApp = new OpenAPIHono<HonoBindings>();
registerDiscountRoutes(discountsApp);
app.route("/discounts", discountsApp);

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
