import { getOrder } from "@/db/queries/orders";
import { getServerAuthSession } from "@/lib/auth/get-session";
import { verifyOrderAccessToken } from "@/lib/orders/order-access-token";
import type { Order } from "@/types/domain";

export async function getViewableOrder(
  orderId: null | string | undefined,
  accessKey?: null | string
): Promise<Order | null> {
  if (!orderId) return null;

  const [session, rawOrder] = await Promise.all([
    getServerAuthSession(),
    getOrder(orderId),
  ]);
  if (!rawOrder) return null;

  const sessionUserId = session?.user?.id;
  if (sessionUserId && rawOrder.userId === sessionUserId) {
    return rawOrder;
  }

  if (accessKey && verifyOrderAccessToken(rawOrder.id, accessKey)) {
    return rawOrder;
  }

  return null;
}
