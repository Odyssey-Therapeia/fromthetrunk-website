/**
 * Development-only tracing for one bag mutation, end to end.
 *
 * Every removal writes the same requestId on the client and on the server, so
 * a single click can be read as one story instead of guessed at from two
 * halves: which branch the DELETE actually took, what the row and the product
 * each said about the hold, and what the client then did with the answer.
 *
 * Never logs a reservation token. The token IS the proof of ownership — a
 * console line or a server log carrying one is a hold anybody who reads it can
 * release. Only whether it was present and whether it verified.
 */

const isEnabled = process.env.NODE_ENV !== "production";

/** Short, sortable, and not a secret. Prefixed so it greps cleanly. */
export function newCartRequestId(): string {
  return `cart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type Loggable = Record<string, boolean | null | number | string | undefined>;

function emit(channel: string, fields: Loggable): void {
  if (!isEnabled) return;
  const line = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.info(`[${channel}] ${line}`);
}

export function logCartClientStart(fields: {
  localCount?: number;
  productId: string;
  requestId: string;
  serverCount?: number;
  sessionStatus: string;
  source?: string;
  userId: null | string;
}): void {
  emit("cart.remove.client.start", fields);
}

export function logCartClientResult(fields: {
  removed: boolean;
  requestId: string;
  status: string;
  viewerState?: string;
}): void {
  emit("cart.remove.client.result", fields);
}

export function logCartRemoveServer(fields: {
  cartReservedUntil?: null | string;
  cartRowFound: boolean;
  exactReservationMatch?: boolean;
  paymentHoldActive?: boolean;
  productId: string;
  productReservedUntil?: null | string;
  productStockStatus?: string;
  reason?: string;
  released?: boolean;
  removed?: boolean;
  requestId: string;
  tokenValid?: boolean;
  userId: string;
  viewerState?: string;
}): void {
  emit("cart.remove.server", fields);
}

export function logCartSync(fields: {
  localCount: number;
  nextCount: number;
  serverCount: number;
  sessionStatus: string;
  userId: null | string;
}): void {
  emit("cart.sync", fields);
}
