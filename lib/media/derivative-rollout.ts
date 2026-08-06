const enabled = (name: string): boolean => process.env[name] === "1";

/** Server-only rollout switches. None use NEXT_PUBLIC_* and all default off. */
export const isMediaDerivativeConsumptionEnabled = (): boolean =>
  enabled("FTT_MEDIA_DERIVATIVES_ACTIVE");

export const isMediaDerivativeUploadGenerationEnabled = (): boolean =>
  enabled("FTT_MEDIA_DERIVATIVE_UPLOADS_ENABLED");

export const isMediaDerivativePublishGuardEnabled = (): boolean =>
  enabled("FTT_MEDIA_DERIVATIVE_PUBLISH_GUARD");
