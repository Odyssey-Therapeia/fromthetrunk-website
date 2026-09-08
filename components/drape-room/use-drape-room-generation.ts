"use client";

import * as React from "react";

import {
  createDrapeRoomIdempotencyKey,
  DrapeRoomClientError,
  type DrapeRoomClientTransport,
} from "@/lib/drape-room/client/api";
import { readImageDimensions } from "@/lib/drape-room/client/photo-processing";
import {
  createRenderCacheKey,
  drapeRoomStorage,
  hasCurrentDrapeRoomConsent,
  type DrapeRoomConsentIdentity,
  type StoredUserPhoto,
} from "@/lib/drape-room/client/storage";
import { PHOTO_READINESS_POLICY_VERSION } from "@/lib/drape-room/client/photo-readiness-policy";
import {
  useDrapeRoomOperationalStore,
  type DrapeRoomPhase,
} from "@/lib/drape-room/client/store";
import type {
  DrapeRoomBackground,
  DrapeRoomDailyQuota,
  PublicTryOnConfig,
} from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import {
  assertAuthoritativeDrapeRoomIdentity,
  isDrapeRoomRequestContextCurrent,
  toDrapeRoomResult,
} from "./drape-room-result-cache";
import { DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE } from "./drape-room-copy";
import type { DrapeRoomResult } from "./types";

/**
 * How long the finished create button holds at a full fill before the preview
 * replaces the setup view. Long enough to read as landing, short enough that
 * nobody waits on an animation for a result that is already in hand.
 */
const COMPLETION_BEAT_MS = 420;

type ResultsByBackground = Partial<
  Record<DrapeRoomBackground, DrapeRoomResult>
>;

export function useDrapeRoomGeneration({
  config,
  consentToken,
  generationAvailable,
  transport,
  onConsentRequired,
  product,
  photo,
  photoRevision,
  phase,
  cacheLookupReady,
  consentIdentity,
  results,
  resultUrls,
  setResults,
  setConsentAccepted,
  setStatusMessage,
  setErrorMessage,
  onDailyQuota,
}: {
  config: PublicTryOnConfig | null;
  consentToken: string | null;
  generationAvailable: boolean;
  transport: DrapeRoomClientTransport;
  onConsentRequired: () => Promise<void>;
  product: DrapeSaree | null;
  photo: StoredUserPhoto | null;
  photoRevision: number;
  phase: DrapeRoomPhase;
  cacheLookupReady: boolean;
  consentIdentity: DrapeRoomConsentIdentity | null;
  results: ResultsByBackground;
  resultUrls: React.MutableRefObject<Map<string, string>>;
  setResults: React.Dispatch<React.SetStateAction<ResultsByBackground>>;
  setConsentAccepted: (accepted: boolean) => void;
  setStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  onDailyQuota: (productId: string, quota: DrapeRoomDailyQuota) => void;
}) {
  const setBackground = useDrapeRoomOperationalStore(
    (state) => state.setBackground,
  );
  const setPhase = useDrapeRoomOperationalStore((state) => state.setPhase);
  const setStorageMode = useDrapeRoomOperationalStore(
    (state) => state.setStorageMode,
  );
  const setActiveRequestId = useDrapeRoomOperationalStore(
    (state) => state.setActiveRequestId,
  );
  const setProductReferenceVersion = useDrapeRoomOperationalStore(
    (state) => state.setProductReferenceVersion,
  );
  const fail = useDrapeRoomOperationalStore((state) => state.fail);
  const requestInFlight = React.useRef(false);

  const generate = async (background: DrapeRoomBackground) => {
    let refreshConsentConfig = false;
    if (requestInFlight.current || phase === "generating") return;
    if (
      !generationAvailable ||
      !config ||
      !consentToken ||
      !consentIdentity
    ) {
      setErrorMessage(DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!photo || !product) {
      setErrorMessage("Add a photo before creating your Drape Room preview.");
      return;
    }
    if (
      photo.readiness?.state !== "ready" ||
      photo.readiness.policyVersion !== PHOTO_READINESS_POLICY_VERSION
    ) {
      setErrorMessage(
        "Choose a clear photo of one person before generating.",
      );
      return;
    }
    if (!cacheLookupReady) {
      setErrorMessage(
        "Wait while this browser checks for an existing Drape Room preview.",
      );
      return;
    }
    if (!hasCurrentDrapeRoomConsent(consentIdentity)) {
      setConsentAccepted(false);
      setErrorMessage(
        "Confirm the current photo and provider consent before generating.",
      );
      return;
    }

    const idempotencyKey = createDrapeRoomIdempotencyKey();
    const requestPhotoRevision = photoRevision;
    const requestPhotoDigest = photo.digest;
    const requestProductId = product.productId;
    const requestIsCurrent = () => {
      const state = useDrapeRoomOperationalStore.getState();
      return isDrapeRoomRequestContextCurrent({
        expectedRequestId: idempotencyKey,
        expectedPhotoRevision: requestPhotoRevision,
        expectedProductId: requestProductId,
        activeRequestId: state.activeRequestId,
        photoRevision: state.photoRevision,
        selectedProductId: state.selectedSaree?.productId ?? null,
      });
    };
    const markStaleRequestSettled = () => {
      setPhase("ready");
      setErrorMessage(null);
      setStatusMessage(
        "The earlier request finished after your photo changed, so its preview was not saved.",
      );
    };

    requestInFlight.current = true;
    setActiveRequestId(idempotencyKey);
    setPhase("generating");
    setStatusMessage(
      "Creating your Classic Nivi preview. You may close and reopen this window.",
    );
    setErrorMessage(null);

    try {
      const generated = await transport.generate({
        photo: photo.blob,
        photoDigest: requestPhotoDigest,
        consentToken,
        product,
        background,
        idempotencyKey,
      });
      onDailyQuota(requestProductId, generated.dailyQuota);
      assertAuthoritativeDrapeRoomIdentity(config, generated.identity);
      if (!requestIsCurrent()) {
        markStaleRequestSettled();
        return;
      }
      const dimensions = await readImageDimensions(generated.blob);
      if (!requestIsCurrent()) {
        markStaleRequestSettled();
        return;
      }
      const cacheKey = await createRenderCacheKey({
        userPhotoDigest: requestPhotoDigest,
        productId: product.productId,
        productReferenceVersion: generated.identity.productReferenceVersion,
        referenceContractVersion: generated.identity.referenceContractVersion,
        background,
        provider: generated.identity.provider,
        model: generated.identity.model,
        promptVersion: generated.identity.promptVersion,
        engineVersion: generated.identity.engineVersion,
        outputVersion: generated.identity.outputVersion,
      });
      if (!requestIsCurrent()) {
        markStaleRequestSettled();
        return;
      }
      const stored = await drapeRoomStorage.saveRender({
        cacheKey,
        blob: generated.blob,
        width: dimensions.width,
        height: dimensions.height,
        userPhotoDigest: requestPhotoDigest,
        productId: product.productId,
        productSlug: product.productSlug,
        productName: product.productName,
        productReferenceVersion: generated.identity.productReferenceVersion,
        referenceContractVersion: generated.identity.referenceContractVersion,
        background,
        provider: generated.identity.provider,
        model: generated.identity.model,
        promptVersion: generated.identity.promptVersion,
        engineVersion: generated.identity.engineVersion,
        outputVersion: generated.identity.outputVersion,
      });

      const nextStorageMode = await drapeRoomStorage.mode();
      if (!requestIsCurrent()) {
        await drapeRoomStorage.deleteRender(stored.cacheKey);
        markStaleRequestSettled();
        return;
      }

      /*
       * The request has landed and the render is stored. Marking the phase
       * complete here — one beat before the result is committed — lets the
       * create button finish its fill instead of vanishing at 92% when the
       * preview replaces the setup view.
       */
      setPhase("complete");
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, COMPLETION_BEAT_MS);
      });
      if (!requestIsCurrent()) {
        await drapeRoomStorage.deleteRender(stored.cacheKey);
        markStaleRequestSettled();
        return;
      }

      const previous = results[background];
      if (previous) {
        URL.revokeObjectURL(previous.previewUrl);
        resultUrls.current.delete(previous.cacheKey);
      }
      const previewUrl = URL.createObjectURL(stored.blob);
      resultUrls.current.set(stored.cacheKey, previewUrl);
      setResults((current) => ({
        ...current,
        [background]: toDrapeRoomResult(stored, previewUrl),
      }));
      setProductReferenceVersion(generated.identity.productReferenceVersion);
      setBackground(background);
      setStorageMode(nextStorageMode);
      setStatusMessage(
        "Your Drape Room preview is ready and saved in this browser.",
      );
    } catch (error) {
      if (error instanceof DrapeRoomClientError && error.dailyQuota) {
        onDailyQuota(requestProductId, error.dailyQuota);
      }
      if (!requestIsCurrent()) {
        markStaleRequestSettled();
        return;
      }
      const code =
        error instanceof DrapeRoomClientError ? error.code : "UNKNOWN";
      if (code === "CONSENT_REQUIRED") {
        setConsentAccepted(false);
        refreshConsentConfig = true;
      }
      fail(code);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The Drape Room could not create this preview. Your current image was kept.",
      );
      // Existing results remain untouched when a new background fails.
    } finally {
      requestInFlight.current = false;
      setActiveRequestId(null);
      if (refreshConsentConfig) await onConsentRequired();
    }
  };

  return { generate, requestInFlight };
}
