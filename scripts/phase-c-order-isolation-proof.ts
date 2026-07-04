import { and, count, eq, gt, inArray, like, or } from "drizzle-orm";

import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { db, rawSql } from "@/db";
import { createOrder } from "@/db/queries/orders";
import {
  addresses,
  events,
  orderEvents,
  orderItems,
  orders,
  products,
  reservations,
  users,
  wishlistItems,
} from "@/db/schema";
import {
  createOrderAccessToken,
  verifyOrderAccessToken,
} from "@/lib/orders/order-access-token";
import { createRouteHarness } from "../tests/helpers/route-harness";

type AuthUser = {
  email: string;
  id: string;
  role: "admin" | "customer";
};

type ScenarioResult = Record<string, boolean | number | string | string[]>;

const allowSyntheticDb = process.argv.includes("--allow-synthetic-db");
const runId = `phase-c-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const requireSafeEnv = () => {
  if (!allowSyntheticDb) {
    throw new Error("Refusing DB mutation without --allow-synthetic-db.");
  }

  const keyIds = [
    process.env.RAZORPAY_KEY_ID,
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  ].filter(Boolean);
  if (keyIds.length === 0 || keyIds.some((key) => !key?.startsWith("rzp_test_"))) {
    throw new Error("Refusing to run unless Razorpay key ids are test-mode.");
  }

  const publicOrigin = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
  if (publicOrigin.includes("fromthetrunk.shop")) {
    throw new Error("Refusing to run against production public origin.");
  }

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production environment.");
  }

  process.env.GA4_MEASUREMENT_ID = "";
  process.env.GA4_API_SECRET = "";
  process.env.META_CAPI_PIXEL_ID = "";
  process.env.META_CAPI_ACCESS_TOKEN = "";
};

const syntheticEmail = (label: string) => `${runId}-${label}@example.test`;

const makeAuthUser = async (label: string): Promise<AuthUser> => {
  const [row] = await db
    .insert(users)
    .values({
      email: syntheticEmail(label),
      name: `Phase C ${label}`,
      role: "customer",
    })
    .returning({ email: users.email, id: users.id, role: users.role });

  if (!row) throw new Error("Failed to create synthetic user.");
  return { email: row.email, id: row.id, role: row.role };
};

const makeProduct = async (
  label: string,
  stockStatus: "available" | "reserved" | "sold" = "available",
) => {
  const now = new Date();
  const [row] = await db
    .insert(products)
    .values({
      name: `Phase C Synthetic ${label}`,
      pricePaise: 150000,
      quantityAvailable: stockStatus === "sold" ? 0 : 1,
      reservedUntil:
        stockStatus === "reserved"
          ? new Date(now.getTime() + 30 * 60 * 1000)
          : null,
      slug: `${runId}-${label}`,
      soldAt: stockStatus === "sold" ? now : null,
      status: "published",
      stockStatus,
      storyTitle: `Phase C Synthetic ${label}`,
    })
    .returning({ id: products.id, slug: products.slug });

  if (!row) throw new Error("Failed to create synthetic product.");
  return row;
};

const paymentHarness = (authUser: AuthUser) =>
  createRouteHarness({ authUser, register: registerPaymentRoutes });

const orderHarness = (authUser: AuthUser) =>
  createRouteHarness({ authUser, register: registerOrderRoutes });

const createOrderBody = (productId: string, label: string) => ({
  items: [{ productId, quantity: 1 }],
  shippingAddress: {
    city: "Mumbai",
    country: "India",
    email: syntheticEmail(`ship-${label}`),
    line1: "Synthetic Phase C address",
    name: `Phase C ${label}`,
    postalCode: "400001",
  },
  shippingMethod: "standard",
});

const createPaymentOrder = async (params: {
  attemptId: string;
  label: string;
  productId: string;
  user: AuthUser;
}) => {
  const { request } = paymentHarness(params.user);
  const response = await request("/create-order", {
    body: JSON.stringify({
      ...createOrderBody(params.productId, params.label),
      checkoutAttemptId: params.attemptId,
    }),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": params.attemptId,
    },
    method: "POST",
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  return {
    code: typeof json.code === "string" ? json.code : null,
    hasPaymentLink: typeof json.paymentLinkUrl === "string",
    orderId: typeof json.orderId === "string" ? json.orderId : null,
    reused: json.reused === true,
    status: response.status,
  };
};

const countRows = async <T extends number>(query: Promise<Array<{ total: T }>>) =>
  (await query)[0]?.total ?? 0;

const countScenario = async (productId: string, attemptIds: string[]) => {
  const orderRows = await db
    .select({
      id: orders.id,
      paymentStatus: orders.paymentStatus,
      razorpayOrderId: orders.razorpayOrderId,
    })
    .from(orders)
    .where(inArray(orders.idempotencyKey, attemptIds));

  const [productRow] = await db
    .select({
      reservedUntil: products.reservedUntil,
      stockStatus: products.stockStatus,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return {
    activeHolds:
      productRow?.stockStatus === "reserved" &&
      productRow.reservedUntil != null &&
      productRow.reservedUntil > new Date()
        ? 1
        : 0,
    failedRows: orderRows.filter((row) => row.paymentStatus === "failed").length,
    orderRows: orderRows.length,
    paymentLinkRows: orderRows.filter((row) => row.razorpayOrderId).length,
    productStockStatus: productRow?.stockStatus ?? "missing",
  };
};

const createdOrderIds = async () => {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(like(orders.idempotencyKey, `${runId}%`));
  return rows.map((row) => row.id);
};

const assertStatus = (
  results: Awaited<ReturnType<typeof createPaymentOrder>>[],
  expected: number[],
) => {
  const actual = results.map((result) => result.status).sort();
  const wanted = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(wanted);
};

const scenarioSameAttempt = async (): Promise<ScenarioResult> => {
  const user = await makeAuthUser("double-click");
  const product = await makeProduct("double-click");
  const attemptId = `${runId}-same-attempt`;

  const concurrent = await Promise.all([
    createPaymentOrder({ attemptId, label: "double", productId: product.id, user }),
    createPaymentOrder({ attemptId, label: "double", productId: product.id, user }),
  ]);
  const retry = await createPaymentOrder({ attemptId, label: "double", productId: product.id, user });
  const counts = await countScenario(product.id, [attemptId]);
  const winnerOrderId = concurrent.find((result) => result.status === 200)?.orderId ?? null;
  const retryOrderMatchedWinner = Boolean(winnerOrderId && retry.orderId === winnerOrderId);

  return {
    ...counts,
    noRawLinkForConflict: concurrent
      .filter((result) => result.status !== 200)
      .every((result) => !result.hasPaymentLink),
    passed:
      assertStatus(concurrent, [200, 409]) &&
      retry.status === 200 &&
      retryOrderMatchedWinner &&
      counts.orderRows === 1 &&
      counts.failedRows === 0 &&
      counts.paymentLinkRows === 1 &&
      counts.activeHolds === 1,
    retryOrderMatchedWinner,
    retryReused: retry.reused,
    statuses: concurrent.map((result) => String(result.status)).sort(),
  };
};

const scenarioTwoUsersSameProduct = async (): Promise<{
  ownerOrderId: null | string;
  result: ScenarioResult;
}> => {
  const userA = await makeAuthUser("multi-a");
  const userB = await makeAuthUser("multi-b");
  const product = await makeProduct("multi-user");
  const attemptA = `${runId}-multi-a`;
  const attemptB = `${runId}-multi-b`;

  const concurrent = await Promise.all([
    createPaymentOrder({ attemptId: attemptA, label: "multi-a", productId: product.id, user: userA }),
    createPaymentOrder({ attemptId: attemptB, label: "multi-b", productId: product.id, user: userB }),
  ]);
  const counts = await countScenario(product.id, [attemptA, attemptB]);
  const winner = concurrent.find((result) => result.status === 200);
  const loser = concurrent.find((result) => result.status !== 200);

  return {
    ownerOrderId: winner?.orderId ?? null,
    result: {
      ...counts,
      loserCannotPay: Boolean(loser && !loser.hasPaymentLink),
      loserCode: loser?.code ?? "none",
      passed:
        assertStatus(concurrent, [200, 409]) &&
        counts.orderRows === 2 &&
        counts.failedRows === 1 &&
        counts.paymentLinkRows === 1 &&
        counts.activeHolds === 1 &&
        Boolean(loser && !loser.hasPaymentLink),
      statuses: concurrent.map((result) => String(result.status)).sort(),
    },
  };
};

const scenarioCrossUserSameKey = async (): Promise<ScenarioResult> => {
  const owner = await makeAuthUser("cross-owner");
  const other = await makeAuthUser("cross-other");
  const product = await makeProduct("cross-key");
  const attemptId = `${runId}-cross-key`;

  const first = await createPaymentOrder({ attemptId, label: "cross-owner", productId: product.id, user: owner });
  const second = await createPaymentOrder({ attemptId, label: "cross-other", productId: product.id, user: other });
  const counts = await countScenario(product.id, [attemptId]);

  return {
    ...counts,
    firstStatus: first.status,
    noLinkLeak: !second.hasPaymentLink,
    passed:
      first.status === 200 &&
      second.status === 409 &&
      !second.hasPaymentLink &&
      counts.orderRows === 1 &&
      counts.paymentLinkRows === 1,
    secondCode: second.code ?? "none",
    secondStatus: second.status,
  };
};

const scenarioChangedCart = async (): Promise<ScenarioResult> => {
  const user = await makeAuthUser("changed-cart");
  const firstProduct = await makeProduct("changed-a");
  const secondProduct = await makeProduct("changed-b");
  const firstAttempt = `${runId}-changed-a`;
  const secondAttempt = `${runId}-changed-b`;

  const first = await createPaymentOrder({ attemptId: firstAttempt, label: "changed-a", productId: firstProduct.id, user });
  const second = await createPaymentOrder({ attemptId: secondAttempt, label: "changed-b", productId: secondProduct.id, user });
  const firstCounts = await countScenario(firstProduct.id, [firstAttempt]);
  const secondCounts = await countScenario(secondProduct.id, [secondAttempt]);

  return {
    firstOrderRows: firstCounts.orderRows,
    firstPaymentLinkRows: firstCounts.paymentLinkRows,
    firstStatus: first.status,
    passed:
      first.status === 200 &&
      second.status === 200 &&
      !second.reused &&
      first.orderId !== second.orderId &&
      firstCounts.orderRows === 1 &&
      secondCounts.orderRows === 1 &&
      firstCounts.paymentLinkRows === 1 &&
      secondCounts.paymentLinkRows === 1,
    secondOrderRows: secondCounts.orderRows,
    secondPaymentLinkRows: secondCounts.paymentLinkRows,
    secondReused: second.reused,
    secondStatus: second.status,
  };
};

const scenarioSoldProduct = async (): Promise<ScenarioResult> => {
  const user = await makeAuthUser("sold");
  const product = await makeProduct("sold", "sold");
  const attemptId = `${runId}-sold`;
  const response = await createPaymentOrder({ attemptId, label: "sold", productId: product.id, user });
  const counts = await countScenario(product.id, [attemptId]);

  return {
    ...counts,
    code: response.code ?? "none",
    noPaymentLink: !response.hasPaymentLink,
    passed:
      response.status === 409 &&
      response.code === "PRODUCT_SOLD" &&
      !response.hasPaymentLink &&
      counts.orderRows === 0 &&
      counts.paymentLinkRows === 0,
    status: response.status,
  };
};

const scenarioOrderAccess = async (orderId: string): Promise<ScenarioResult> => {
  const [order] = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order?.userId) throw new Error("Missing owner order for access scenario.");

  const [owner] = await db
    .select({ email: users.email, id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);
  if (!owner) throw new Error("Missing owner user for access scenario.");

  const wrongUser = await makeAuthUser("wrong-access");
  const admin: AuthUser = {
    email: syntheticEmail("admin"),
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin",
  };

  const ownerAuth: AuthUser = { email: owner.email, id: owner.id, role: owner.role };
  const ownerOrderResponse = await orderHarness(ownerAuth).request(`/${orderId}`);
  const wrongOrderResponse = await orderHarness(wrongUser).request(`/${orderId}`);
  const adminOrderResponse = await orderHarness(admin).request(`/${orderId}`);
  const ownerListResponse = await orderHarness(ownerAuth).request("/");
  const wrongListResponse = await orderHarness(wrongUser).request("/");
  const ownerList = (await ownerListResponse.json().catch(() => [])) as Array<{ id?: string }>;
  const wrongList = (await wrongListResponse.json().catch(() => [])) as Array<{ id?: string }>;

  const ownerPaymentStatus = await paymentHarness(ownerAuth).request(`/status?orderId=${orderId}`);
  const wrongPaymentStatus = await paymentHarness(wrongUser).request(`/status?orderId=${orderId}`);
  const adminPaymentStatus = await paymentHarness(admin).request(`/status?orderId=${orderId}`);
  const validKey = createOrderAccessToken(orderId);
  const wrongKey = createOrderAccessToken("99999999-9999-4999-8999-999999999999");
  const publicValidStatus = await paymentHarness({ ...wrongUser, id: "anonymous", role: "customer" }).request(
    `/status?${new URLSearchParams({ key: validKey, orderId })}`,
  );
  const publicWrongStatus = await paymentHarness({ ...wrongUser, id: "anonymous", role: "customer" }).request(
    `/status?${new URLSearchParams({ key: wrongKey, orderId })}`,
  );
  const wrongRepay = await paymentHarness(wrongUser).request(`/orders/${orderId}/repay`, {
    method: "POST",
  });

  return {
    adminDetailStatus: adminOrderResponse.status,
    adminPaymentStatus: adminPaymentStatus.status,
    ownerDetailStatus: ownerOrderResponse.status,
    ownerHistoryIncludesOrder: ownerList.some((item) => item.id === orderId),
    ownerPaymentStatus: ownerPaymentStatus.status,
    passed:
      ownerOrderResponse.status === 200 &&
      wrongOrderResponse.status === 403 &&
      adminOrderResponse.status === 200 &&
      ownerPaymentStatus.status === 200 &&
      wrongPaymentStatus.status === 403 &&
      adminPaymentStatus.status === 200 &&
      publicValidStatus.status === 200 &&
      publicWrongStatus.status === 403 &&
      wrongRepay.status === 403 &&
      ownerList.some((item) => item.id === orderId) &&
      !wrongList.some((item) => item.id === orderId),
    validTokenStatus: publicValidStatus.status,
    wrongHistoryIncludesOrder: wrongList.some((item) => item.id === orderId),
    wrongPaymentStatus: wrongPaymentStatus.status,
    wrongRepayStatus: wrongRepay.status,
    wrongTokenStatus: publicWrongStatus.status,
  };
};

const scenarioReceipt = async (): Promise<ScenarioResult> => {
  const owner = await makeAuthUser("receipt-owner");
  const product = await makeProduct("receipt-paid");
  const order = await createOrder({
    cartFingerprint: "phase-c-receipt",
    idempotencyKey: `${runId}-receipt-paid`,
    items: [
      {
        imageUrl: null,
        name: "Phase C Synthetic Receipt Saree",
        pricePaise: 150000,
        productId: product.id,
        quantity: 1,
        selectedOptions: {},
      },
    ],
    paidAt: new Date(),
    paymentGateway: "razorpay",
    paymentId: `${runId}-synthetic-payment`,
    paymentMethod: "upi",
    paymentStatus: "paid",
    razorpayOrderId: `${runId}-synthetic-link`,
    shippingCity: "Mumbai",
    shippingCostPaise: 0,
    shippingCountry: "India",
    shippingEmail: syntheticEmail("receipt-ship"),
    shippingLine1: "Synthetic Phase C address",
    shippingMethod: "standard",
    shippingName: "Phase C Receipt",
    shippingPostalCode: "400001",
    status: "confirmed",
    subtotalPaise: 150000,
    taxAmountPaise: 0,
    taxRate: "0.00",
    totalPaise: 150000,
    userId: owner.id,
  });

  const validKey = createOrderAccessToken(order.id);
  const wrongKey = createOrderAccessToken("99999999-9999-4999-8999-999999999999");
  const validTokenAccepted = verifyOrderAccessToken(order.id, validKey);
  const wrongTokenRejected = !verifyOrderAccessToken(order.id, wrongKey);

  return {
    passed:
      order.paymentStatus === "paid" &&
      validTokenAccepted &&
      wrongTokenRejected,
    routeCoverage: "unit:order-receipt-route-isolation",
    validReceiptTokenAccepted: validTokenAccepted,
    wrongReceiptTokenRejected: wrongTokenRejected,
  };
};

const collectSyntheticIds = async () => {
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${runId}-%@example.test`));
  const productRows = await db
    .select({ id: products.id })
    .from(products)
    .where(like(products.slug, `${runId}-%`));
  const orderFilters = [
    like(orders.idempotencyKey, `${runId}%`),
    like(orders.shippingEmail, `${runId}-%@example.test`),
  ];
  if (userRows.length > 0) {
    orderFilters.push(inArray(orders.userId, userRows.map((row) => row.id)));
  }
  const orderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(or(...orderFilters));

  return {
    orderIds: orderRows.map((row) => row.id),
    productIds: productRows.map((row) => row.id),
    userIds: userRows.map((row) => row.id),
  };
};

const cleanupSyntheticData = async () => {
  const { orderIds, productIds, userIds } = await collectSyntheticIds();

  await rawSql`DELETE FROM events WHERE event_id LIKE ${`checkout_attempt:${runId}%`}`;
  for (const orderId of orderIds) {
    await rawSql`DELETE FROM events WHERE payload->>'orderId' = ${orderId}`;
  }

  if (orderIds.length > 0) {
    await db.delete(orderEvents).where(inArray(orderEvents.orderId, orderIds));
    await db.delete(reservations).where(inArray(reservations.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length > 0) {
    await db.delete(addresses).where(inArray(addresses.userId, userIds));
    await db.delete(wishlistItems).where(inArray(wishlistItems.userId, userIds));
  }
  if (productIds.length > 0) {
    await db.delete(reservations).where(inArray(reservations.productId, productIds));
    await db.delete(wishlistItems).where(inArray(wishlistItems.productId, productIds));
    await db.delete(products).where(inArray(products.id, productIds));
  }
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
};

const cleanupCounts = async () => {
  const { orderIds, productIds, userIds } = await collectSyntheticIds();
  let syntheticEvents = await countRows(
    db
      .select({ total: count() })
      .from(events)
      .where(like(events.eventId, `checkout_attempt:${runId}%`)),
  );
  for (const orderId of orderIds) {
    const rows = (await rawSql`
      SELECT COUNT(*)::int AS total
      FROM events
      WHERE payload->>'orderId' = ${orderId}
    `) as Array<{ total: number }>;
    syntheticEvents += rows[0]?.total ?? 0;
  }

  return {
    addresses: userIds.length
      ? await countRows(db.select({ total: count() }).from(addresses).where(inArray(addresses.userId, userIds)))
      : 0,
    events: syntheticEvents,
    orderItems: orderIds.length
      ? await countRows(db.select({ total: count() }).from(orderItems).where(inArray(orderItems.orderId, orderIds)))
      : 0,
    orderRows: orderIds.length,
    orderEvents: orderIds.length
      ? await countRows(db.select({ total: count() }).from(orderEvents).where(inArray(orderEvents.orderId, orderIds)))
      : 0,
    products: productIds.length,
    reservations:
      orderIds.length || productIds.length
        ? await countRows(
            db
              .select({ total: count() })
              .from(reservations)
              .where(
                or(
                  ...(orderIds.length ? [inArray(reservations.orderId, orderIds)] : []),
                  ...(productIds.length ? [inArray(reservations.productId, productIds)] : []),
                ),
              ),
          )
        : 0,
    users: userIds.length,
    wishlistRows:
      userIds.length || productIds.length
        ? await countRows(
            db
              .select({ total: count() })
              .from(wishlistItems)
              .where(
                or(
                  ...(userIds.length ? [inArray(wishlistItems.userId, userIds)] : []),
                  ...(productIds.length ? [inArray(wishlistItems.productId, productIds)] : []),
                ),
              ),
          )
        : 0,
  };
};

async function main() {
  requireSafeEnv();
  await cleanupSyntheticData();

  let results: Record<string, ScenarioResult> = {};
  let cleanupAfter = await cleanupCounts();

  try {
    results.sameAttemptDoubleClick = await scenarioSameAttempt();
    const multi = await scenarioTwoUsersSameProduct();
    results.twoUsersSameProduct = multi.result;
    results.crossUserSameIdempotencyKey = await scenarioCrossUserSameKey();
    results.changedCart = await scenarioChangedCart();
    results.soldProduct = await scenarioSoldProduct();
    if (!multi.ownerOrderId) throw new Error("No owner order id from multi-user scenario.");
    results.orderAccessIsolation = await scenarioOrderAccess(multi.ownerOrderId);
    results.receiptIsolation = await scenarioReceipt();

    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    await cleanupSyntheticData();
    await new Promise((resolve) => setTimeout(resolve, 250));
    cleanupAfter = await cleanupCounts();
  }

  const allScenariosPassed = Object.values(results).every((result) => result.passed === true);
  const cleanupZero = Object.values(cleanupAfter).every((value) => value === 0);

  console.log(
    JSON.stringify(
      {
        cleanupAfter,
        cleanupZero,
        env: {
          notificationsDisabledForProof: true,
          razorpayMode: "test",
          syntheticOnly: true,
        },
        go: allScenariosPassed && cleanupZero,
        results,
        run: "phase-c-order-isolation-proof",
      },
      null,
      2,
    ),
  );

  if (!allScenariosPassed || !cleanupZero) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  try {
    await cleanupSyntheticData();
  } catch {
    // Do not mask the original failure.
  }
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "Unknown Phase C proof failure",
        run: "phase-c-order-isolation-proof",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
