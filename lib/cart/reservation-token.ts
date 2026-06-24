import crypto from "crypto";

type ReservationTokenPayload = {
  productId: string;
  reservedUntil: string;
  v: 1;
};

const getReservationTokenSecret = () =>
  process.env.RESERVATION_TOKEN_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  "";

const sign = (payloadPart: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");

export const createReservationToken = ({
  productId,
  reservedUntil,
}: {
  productId: string;
  reservedUntil: Date;
}) => {
  const secret = getReservationTokenSecret();
  if (!secret) {
    throw new Error("RESERVATION_TOKEN_SECRET_MISSING");
  }

  const payload: ReservationTokenPayload = {
    productId,
    reservedUntil: reservedUntil.toISOString(),
    v: 1,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadPart}.${sign(payloadPart, secret)}`;
};

export const verifyReservationToken = (token: null | string | undefined) => {
  if (!token) return null;

  const secret = getReservationTokenSecret();
  if (!secret) return null;

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
    if (typeof payload.reservedUntil !== "string") return null;

    const reservedUntil = new Date(payload.reservedUntil);
    if (Number.isNaN(reservedUntil.getTime())) return null;

    return {
      productId: payload.productId,
      reservedUntil,
    };
  } catch {
    return null;
  }
};
