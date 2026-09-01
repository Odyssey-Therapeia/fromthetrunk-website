import type { ParsedTryonMultipart } from "@/lib/drape-room/http/multipart";
import type {
  BudgetReservation,
  FinalizeTryonBudgetInput,
  ReserveTryonBudgetInput,
} from "@/lib/drape-room/ledger/budget";
import type { TryonRateAdmission } from "@/lib/drape-room/security/rate-admission";
import type { ProductDailyQuotaClaim } from "@/lib/drape-room/security/product-daily-quota";
import type {
  TryonGenerationLease,
  TryonLeaseAdmission,
  TryonRedisClient,
} from "@/lib/drape-room/security/redis-guard";
import type {
  DrapeRoomConfig,
  DrapeRoomEnvironment,
  EnabledDrapeRoomConfig,
} from "@/lib/drape-room/server/config";
import type { TryOnImageProvider } from "@/lib/drape-room/server/provider";

export type LoadedTryonProduct = {
  saree: { productReferenceVersion: string };
  references: [{
    bytes: Uint8Array;
    mimeType: string;
    version: string;
  }, {
    bytes: Uint8Array;
    mimeType: string;
    version: string;
  }];
};

export type TryonGenerateDependencies = {
  env?: DrapeRoomEnvironment;
  readConfig?: (env: DrapeRoomEnvironment) => DrapeRoomConfig;
  parseMultipart?: (
    request: Request,
    signal?: AbortSignal,
  ) => Promise<ParsedTryonMultipart>;
  rateLimitsReady?: (nodeEnv: string | undefined) => boolean;
  checkRateAdmission?: (
    sessionTag: string,
    ipTag: string,
  ) => Promise<TryonRateAdmission>;
  createRedisClient?: () => TryonRedisClient | null;
  acquireLease?: (
    redis: TryonRedisClient,
    sessionTag: string,
    leaseMs: number,
    now: number,
  ) => Promise<TryonLeaseAdmission>;
  claimProductDailyQuota?: (
    redis: TryonRedisClient,
    ipTag: string,
    productId: string,
    ledgerRequestId: string,
    now: number,
  ) => Promise<ProductDailyQuotaClaim>;
  reserveBudget?: (
    input: ReserveTryonBudgetInput,
  ) => Promise<BudgetReservation>;
  markProviderStarted?: (requestId: string) => Promise<boolean>;
  finalizeBudget?: (input: FinalizeTryonBudgetInput) => Promise<boolean>;
  bindProduct?: (requestId: string, productId: string) => Promise<boolean>;
  loadProduct?: (
    productId: string,
    signal?: AbortSignal,
  ) => Promise<LoadedTryonProduct>;
  createProvider?: (
    config: EnabledDrapeRoomConfig,
  ) => Promise<TryOnImageProvider>;
  createRequestId?: () => string;
  now?: () => number;
};

export type AdmittedTryonRequest = {
  config: EnabledDrapeRoomConfig;
  forecastMicroUsd: number;
  ipTag: string;
  lease: TryonGenerationLease;
  ledgerRequestId: string;
  parsed: ParsedTryonMultipart;
  provider: TryOnImageProvider;
  redis: TryonRedisClient;
};

export async function defaultLoadProduct(
  productId: string,
  signal?: AbortSignal,
): Promise<LoadedTryonProduct> {
  const { loadAuthoritativeTryonProduct } = await import(
    "@/lib/drape-room/catalog/product-reference"
  );
  return loadAuthoritativeTryonProduct(productId, fetch, signal);
}

export function safeTryonHeaderValue(value: string): boolean {
  return (
    value.length > 0 && value.length <= 256 && /^[\x20-\x7e]+$/.test(value)
  );
}

export function utcBudgetPeriod(now: number): string {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
