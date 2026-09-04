import {
  DrapeRoomConfigError,
  disabledPublicTryOnConfig,
  readDrapeRoomConfig,
  type DrapeRoomEnvironment,
} from "@/lib/drape-room/server/config";
import {
  issueTryonConsentToken,
  TRYON_CONSENT_TOKEN_HEADER,
} from "@/lib/drape-room/security/consent-token";
import {
  issueTryonSession,
  readTryonSessionCookie,
  serializeTryonSessionCookie,
} from "@/lib/drape-room/security/session";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export type TryonConfigResponseOptions = {
  env?: DrapeRoomEnvironment;
  now?: number;
};

/** Redacted browser config plus a refreshed anonymous signed session. */
export function handleTryonConfigRequest(
  request: Request,
  options: TryonConfigResponseOptions = {},
): Response {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  try {
    const config = readDrapeRoomConfig(env);
    const headers = new Headers(PRIVATE_NO_STORE_HEADERS);
    if (config.enabled) {
      const current = readTryonSessionCookie(request, env.NODE_ENV);
      const session = issueTryonSession(
        config.sessionSecret,
        current,
        now,
      );
      const consentToken = session
        ? issueTryonConsentToken(
            config,
            config.hmacSecret,
            session.nonce,
            now,
          )
        : null;
      if (!session || !consentToken) {
        return Response.json(disabledPublicTryOnConfig(env), {
          headers,
          status: 503,
        });
      }
      headers.set(
        "Set-Cookie",
        serializeTryonSessionCookie(session.value, env.NODE_ENV),
      );
      headers.set(TRYON_CONSENT_TOKEN_HEADER, consentToken);
    }
    return Response.json(config.publicConfig, { headers, status: 200 });
  } catch (error) {
    if (
      env.NODE_ENV === "development" &&
      error instanceof DrapeRoomConfigError
    ) {
      console.error("[drape-room/config]", error.code);
    }
    return Response.json(disabledPublicTryOnConfig(env), {
      headers: PRIVATE_NO_STORE_HEADERS,
      status: 503,
    });
  }
}
