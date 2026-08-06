import {
  getMediaDerivative,
  listMediaDerivativesForAssets,
  markMediaDerivativeProcessing,
  recordMediaDerivativeFailure,
  saveReadyMediaDerivative,
} from "@/db/queries/media-derivatives";
import type { DerivativeRepository } from "@/lib/media/derivative-generator";

export const mediaDerivativeRepository: DerivativeRepository = {
  listForAsset: (mediaAssetId) =>
    listMediaDerivativesForAssets([mediaAssetId]),
  markProcessing: markMediaDerivativeProcessing,
  recordFailure: recordMediaDerivativeFailure,
  saveReady: saveReadyMediaDerivative,
};

// Re-exported for operational probes without exposing the database module to
// client-facing media helpers.
export { getMediaDerivative };
