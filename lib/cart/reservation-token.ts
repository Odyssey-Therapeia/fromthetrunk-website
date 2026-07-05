import crypto from "crypto";

import { getTokenSecret } from "@/lib/security/token-secrets";

type ReservationTokenPayload = {
  productId: string;
  quantity: 1;
  reservationId?: string;
  reservedUntil: string;
  v: 1;
};

const getReservationTokenSecret = () =>
  getTokenSecret("RESERVATION_TOKEN_SECRET", {
    purpose: "cart reservation tokens",
  });

const sign = (payloadPart: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");

export const createReservationToken = ({
  productId,
  reservationId,
  reservedUntil,
}: {
  productId: string;
  reservationId?: string | null;
  reservedUntil: Date;
}) => {
  const secret = getReservationTokenSecret();

  const payload: ReservationTokenPayload = {
    productId,
    quantity: 1,
    ...(reservationId ? { reservationId } : {}),
    reservedUntil: reservedUntil.toISOString(),
    v: 1,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadPart}.${sign(payloadPart, secret)}`;
};

export const verifyReservationToken = (token: null | string | undefined) => {
  if (!token) return null;

  let secret: string;
  try {
    secret = getReservationTokenSecret();
  } catch {
    return null;
  }

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = sign(payloadPart, secret);
  const actual = Buffer.from(signaturePart);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as Partial<ReservationTokenPayload>;

    if (payload.v !== 1 || typeof payload.productId !== "string") return null;
    if (payload.quantity !== 1 && payload.quantity !== undefined) return null;
    if (
      payload.reservationId !== undefined &&
      typeof payload.reservationId !== "string"
    ) {
      return null;
    }
    if (typeof payload.reservedUntil !== "string") return null;

    const reservedUntil = new Date(payload.reservedUntil);
    if (Number.isNaN(reservedUntil.getTime())) return null;

    return {
      productId: payload.productId,
      quantity: 1 as const,
      reservationId: payload.reservationId,
      reservedUntil,
    };
  } catch {
    return null;
  }
};
