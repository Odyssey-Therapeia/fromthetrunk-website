import {
  MEDIA_DERIVATIVE_ROLES,
  type MediaDerivativeLike,
  type MediaDerivativeRole,
  validateReadyMediaDerivative,
} from "@/lib/media/derivative-policy";

export class MediaDerivativePublicationError extends Error {
  readonly code = "MEDIA_DERIVATIVES_REQUIRED";

  constructor(
    readonly missing: Array<{ mediaAssetId: string; roles: MediaDerivativeRole[] }>,
  ) {
    super("Product publication requires ready media derivatives.");
    this.name = "MediaDerivativePublicationError";
  }
}

export const getMissingPublicationDerivativeRoles = (
  mediaAssetIds: string[],
  rows: MediaDerivativeLike[],
): Array<{ mediaAssetId: string; roles: MediaDerivativeRole[] }> =>
  Array.from(new Set(mediaAssetIds)).flatMap((mediaAssetId) => {
    const validRoles = new Set(
      rows
        .filter(
          (row) =>
            row.mediaAssetId === mediaAssetId &&
            validateReadyMediaDerivative(row).valid,
        )
        .map((row) => row.role)
        .filter((role): role is MediaDerivativeRole => Boolean(role)),
    );
    const roles = MEDIA_DERIVATIVE_ROLES.filter((role) => !validRoles.has(role));
    return roles.length > 0 ? [{ mediaAssetId, roles }] : [];
  });

export const assertPublicationDerivativeRows = (
  mediaAssetIds: string[],
  rows: MediaDerivativeLike[],
): void => {
  if (mediaAssetIds.length === 0) {
    throw new MediaDerivativePublicationError([
      { mediaAssetId: "missing-primary-image", roles: [...MEDIA_DERIVATIVE_ROLES] },
    ]);
  }
  const missing = getMissingPublicationDerivativeRoles(mediaAssetIds, rows);
  if (missing.length > 0) throw new MediaDerivativePublicationError(missing);
};
