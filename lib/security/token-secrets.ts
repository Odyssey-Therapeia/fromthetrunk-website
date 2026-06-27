type TokenSecretName =
  | "AUTH_OTP_SECRET"
  | "AUTH_OTP_TOKEN_SECRET"
  | "EMAIL_VERIFICATION_TOKEN_SECRET"
  | "ORDER_ACCESS_TOKEN_SECRET"
  | "PREVIEW_TOKEN_SECRET"
  | "RESERVATION_TOKEN_SECRET";

const DEFAULT_DEV_FALLBACKS = [
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "PAYLOAD_SECRET",
  "ADMIN_API_SECRET",
] as const;

const REQUIRED_PRODUCTION_SECRETS: TokenSecretName[] = [
  "RESERVATION_TOKEN_SECRET",
  "ORDER_ACCESS_TOKEN_SECRET",
  "EMAIL_VERIFICATION_TOKEN_SECRET",
  "PREVIEW_TOKEN_SECRET",
  "AUTH_OTP_SECRET",
  "AUTH_OTP_TOKEN_SECRET",
];

type GetTokenSecretOptions = {
  devFallbackEnvNames?: readonly string[];
  purpose: string;
};

export function getTokenSecret(
  envName: TokenSecretName,
  { devFallbackEnvNames = DEFAULT_DEV_FALLBACKS, purpose }: GetTokenSecretOptions
): string {
  const configured = process.env[envName];
  if (configured) return configured;

  if (process.env.NODE_ENV !== "production") {
    for (const fallbackName of devFallbackEnvNames) {
      const fallback = process.env[fallbackName];
      if (fallback) return fallback;
    }
  }

  throw new Error(`${envName} is required for ${purpose}.`);
}

export function getMissingProductionTokenSecrets(
  env: NodeJS.ProcessEnv = process.env
): TokenSecretName[] {
  if (env.NODE_ENV !== "production") return [];
  return REQUIRED_PRODUCTION_SECRETS.filter((envName) => !env[envName]);
}

export function assertProductionTokenSecrets(
  env: NodeJS.ProcessEnv = process.env
): void {
  const missing = getMissingProductionTokenSecrets(env);
  if (missing.length > 0) {
    throw new Error(
      `Missing production token secrets: ${missing.join(", ")}`
    );
  }
}
