"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { WishlistButton } from "@/components/product/wishlist-button";
import type { DrapeRoomClientTransport } from "@/lib/drape-room/client/api";
import {
  mergeProductDailyQuotaHint,
  readProductDailyQuotaHint,
  storeProductDailyQuotaHint,
} from "@/lib/drape-room/client/daily-quota";
import {
  processUserPhoto,
  type PhotoGuidanceWarning,
} from "@/lib/drape-room/client/photo-processing";
import { PHOTO_READINESS_POLICY_VERSION } from "@/lib/drape-room/client/photo-readiness-policy";
import {
  completeDrapeRoomOnboarding,
  drapeRoomStorage,
  getDrapeRoomOnboarding,
  hasCurrentDrapeRoomConsent,
  setDrapeRoomConsent,
  type DrapeRoomConsentIdentity,
  type StoredUserPhoto,
} from "@/lib/drape-room/client/storage";
import {
  restoreDrapeRoomTriggerFocus,
  useDrapeRoomOperationalStore,
} from "@/lib/drape-room/client/store";
import {
  DRAPE_ROOM_BACKGROUNDS,
  type DrapeRoomBackground,
  type DrapeRoomAvailability,
  type DrapeRoomDailyQuota,
  type DrapeRoomPhotoView,
} from "@/lib/drape-room/client/types";
import { DrapeRoomStage } from "./drape-room-stage";
import type { DrapeRoomOnboardingAction } from "./drape-room-onboarding";
import {
  createDrapeRoomCacheNamespaceIdentity,
  isCurrentDrapeRoomResult,
  isDrapeRoomCacheLookupSettled,
  loadCachedDrapeRoomResults,
  toDrapeRoomResult,
} from "./drape-room-result-cache";
import {
  setDrapeRoomProgressMessage,
} from "./drape-room-live-status";
import type { DrapeRoomResult } from "./types";
import { useDrapeRoomGeneration } from "./use-drape-room-generation";

export interface DrapeRoomExperienceProps {
  availability: DrapeRoomAvailability;
  transport: DrapeRoomClientTransport;
  onRefreshConfig: () => Promise<void>;
}

export function DrapeRoomExperience({
  availability,
  transport,
  onRefreshConfig,
}: DrapeRoomExperienceProps) {
  const { config, configStatus, consentToken } = availability;
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = useDrapeRoomOperationalStore((state) => state.isOpen);
  const product = useDrapeRoomOperationalStore((state) => state.selectedSaree);
  const activeBackground = useDrapeRoomOperationalStore((state) => state.background);
  const phase = useDrapeRoomOperationalStore((state) => state.phase);
  const operationalStorageMode = useDrapeRoomOperationalStore(
    (state) => state.storageMode,
  );
  const photoRevision = useDrapeRoomOperationalStore((state) => state.photoRevision);
  const close = useDrapeRoomOperationalStore((state) => state.close);
  const setBackground = useDrapeRoomOperationalStore((state) => state.setBackground);
  const setPhase = useDrapeRoomOperationalStore((state) => state.setPhase);
  const setStorageMode = useDrapeRoomOperationalStore((state) => state.setStorageMode);
  const notifyPhotoChanged = useDrapeRoomOperationalStore((state) => state.notifyPhotoChanged);

  const [photo, setPhoto] = React.useState<StoredUserPhoto | null>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [hydratedPhotoRevision, setHydratedPhotoRevision] = React.useState(-1);
  const [results, setResults] = React.useState<
    Partial<Record<DrapeRoomBackground, DrapeRoomResult>>
  >({});
  const [hydratedCache, setHydratedCache] = React.useState<{
    identity: string;
    photoRevision: number;
  } | null>(null);
  const [onboardingComplete, setOnboardingComplete] = React.useState(
    () => getDrapeRoomOnboarding()?.completed === true,
  );
  const [isPhotoBusy, setIsPhotoBusy] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [dailyQuota, setDailyQuota] = React.useState<DrapeRoomDailyQuota | null>(
    null,
  );
  const photoPreparation = React.useRef<AbortController | null>(null);
  const photoUrlRef = React.useRef<string | null>(null);
  const resultUrls = React.useRef(new Map<string, string>());

  const consentIdentity = React.useMemo<DrapeRoomConsentIdentity | null>(
    () =>
      config
        ? {
            provider: config.provider,
            disclosureVersion: config.disclosureVersion,
            privacyPolicyVersion: config.privacyPolicyVersion,
          }
        : null,
    [config],
  );
  const [consentSelection, setConsentSelection] = React.useState(() => ({
    token: consentToken,
    accepted: consentIdentity
      ? hasCurrentDrapeRoomConsent(consentIdentity)
      : false,
  }));
  const consentAccepted = Boolean(
    consentIdentity &&
      (consentSelection.token === consentToken
        ? consentSelection.accepted
        : hasCurrentDrapeRoomConsent(consentIdentity)),
  );
  const updateConsentAccepted = React.useCallback(
    (accepted: boolean) => {
      setConsentSelection({ token: consentToken, accepted });
    },
    [consentToken],
  );
  const currentPhoto =
    hydratedPhotoRevision === photoRevision ? photo : null;
  const expectedCacheIdentity = React.useMemo(
    () =>
      currentPhoto && product
        ? createDrapeRoomCacheNamespaceIdentity({
            photo: currentPhoto,
            product,
            config,
          })
        : null,
    [config, currentPhoto, product],
  );
  const cacheLookupReady = isDrapeRoomCacheLookupSettled(
    expectedCacheIdentity,
    hydratedCache?.identity ?? null,
  ) && hydratedCache?.photoRevision === photoRevision;
  const generationAvailable = Boolean(
    availability.generationAvailable &&
      config &&
      consentToken &&
      product?.generationReady !== false,
  );
  const photoReady = Boolean(
    currentPhoto?.readiness?.state === "ready" &&
      currentPhoto.readiness.policyVersion === PHOTO_READINESS_POLICY_VERSION,
  );
  const handleDailyQuota = React.useCallback(
    (productId: string, quota: DrapeRoomDailyQuota) => {
      storeProductDailyQuotaHint(productId, quota);
      if (
        useDrapeRoomOperationalStore.getState().selectedSaree?.productId !==
        productId
      ) {
        return;
      }
      setDailyQuota((current) => mergeProductDailyQuotaHint(current, quota));
    },
    [],
  );

  React.useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setDailyQuota(
          product ? readProductDailyQuotaHint(product.productId) : null,
        );
      }
    });
    return () => {
      active = false;
    };
  }, [product]);
  const { generate, requestInFlight } = useDrapeRoomGeneration({
    config,
    consentToken,
    generationAvailable,
    transport,
    onConsentRequired: onRefreshConfig,
    product,
    photo: currentPhoto,
    photoRevision,
    phase,
    cacheLookupReady,
    consentIdentity,
    results,
    resultUrls,
    setResults,
    setConsentAccepted: updateConsentAccepted,
    setStatusMessage,
    setErrorMessage,
    onDailyQuota: handleDailyQuota,
  });

  const installPhoto = React.useCallback((record: StoredUserPhoto | null) => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const nextUrl = record ? URL.createObjectURL(record.blob) : null;
    photoUrlRef.current = nextUrl;
    setPhoto(record);
    setPhotoUrl(nextUrl);
  }, []);

  const clearResultUrls = React.useCallback(() => {
    resultUrls.current.forEach((url) => URL.revokeObjectURL(url));
    resultUrls.current.clear();
  }, []);

  React.useEffect(() => clearResultUrls, [clearResultUrls]);

  React.useEffect(() => {
    let active = true;
    const revision = photoRevision;
    void Promise.all([drapeRoomStorage.getUserPhoto(), drapeRoomStorage.mode()]).then(
      ([storedPhoto, mode]) => {
        if (!active) return;
        if (!storedPhoto) {
          clearResultUrls();
          setResults({});
        }
        installPhoto(storedPhoto);
        setHydratedPhotoRevision(revision);
        setStorageMode(mode);
      },
    );
    return () => {
      active = false;
    };
  }, [clearResultUrls, installPhoto, photoRevision, setStorageMode]);

  React.useEffect(
    () => () => {
      photoPreparation.current?.abort();
      setDrapeRoomProgressMessage(null);
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    },
    [],
  );

  React.useEffect(() => {
    if (
      !currentPhoto ||
      currentPhoto.readiness?.policyVersion === PHOTO_READINESS_POLICY_VERSION
    ) {
      return;
    }
    let active = true;
    const checkedDigest = currentPhoto.digest;
    void Promise.resolve()
      .then(() => {
        if (!active) throw new Error("photo_readiness_cancelled");
        setIsPhotoBusy(true);
        setErrorMessage(null);
        setDrapeRoomProgressMessage("Checking your photo locally…");
        return import("@/lib/drape-room/client/photo-readiness-mediapipe");
      })
      .then(({ analyzePhotoReadiness }) => analyzePhotoReadiness(currentPhoto.blob))
      .then(async (readiness) => {
        if (!active) return;
        const updated = await drapeRoomStorage.updateUserPhotoReadiness(
          checkedDigest,
          readiness.ready
            ? {
                state: "ready",
                policyVersion: readiness.policyVersion,
                checkedAt: Date.now(),
              }
            : {
                state: "blocked",
                policyVersion: readiness.policyVersion,
                checkedAt: Date.now(),
                reason: readiness.reason,
              },
        );
        if (!active || !updated) return;
        setIsPhotoBusy(false);
        setDrapeRoomProgressMessage(null);
        installPhoto(updated);
        if (readiness.ready) {
          setStatusMessage("Full-body photo checked locally and ready.");
        } else {
          setErrorMessage(readiness.message);
        }
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage(
          "This browser could not check your photo. Choose a new photo or try a current Chrome or Safari browser.",
        );
      })
      .finally(() => {
        if (!active) return;
        setIsPhotoBusy(false);
        setDrapeRoomProgressMessage(null);
      });
    return () => {
      active = false;
    };
  }, [currentPhoto, installPhoto]);

  React.useEffect(() => {
    if (!currentPhoto || !product || !expectedCacheIdentity) {
      setDrapeRoomProgressMessage(null);
      return;
    }
    if (
      hydratedCache?.identity === expectedCacheIdentity &&
      hydratedCache.photoRevision === photoRevision
    ) {
      return;
    }

    let active = true;
    if (!requestInFlight.current) {
      setPhase("checking-cache");
      setDrapeRoomProgressMessage(
        "Checking this browser for an exact saved preview…",
      );
    }
    void loadCachedDrapeRoomResults({ photo: currentPhoto, product, config })
      .then((records) => {
        if (!active || requestInFlight.current) return;
        clearResultUrls();
        const next: Partial<Record<DrapeRoomBackground, DrapeRoomResult>> = {};
        for (const record of records) {
          const previewUrl = URL.createObjectURL(record.blob);
          resultUrls.current.set(record.cacheKey, previewUrl);
          next[record.background] = toDrapeRoomResult(record, previewUrl);
        }
        const selectedBackground =
          useDrapeRoomOperationalStore.getState().background;
        const preferredBackground = next[selectedBackground]
          ? selectedBackground
          : next.studio
            ? "studio"
            : records[0]?.background ?? "studio";
        setResults(next);
        setHydratedCache({
          identity: expectedCacheIdentity,
          photoRevision,
        });
        setPhase(records.length > 0 ? "complete" : "ready");
        if (preferredBackground !== selectedBackground) {
          setBackground(preferredBackground);
        }
        setDrapeRoomProgressMessage(null);
        setErrorMessage(null);
      })
      .catch(() => {
        if (!active || requestInFlight.current) return;
        setDrapeRoomProgressMessage(null);
        setPhase("error");
        setErrorMessage(
          "This browser could not safely check its saved Drape Room previews. Close and reopen to try again.",
        );
      });
    return () => {
      active = false;
    };
  }, [
    clearResultUrls,
    config,
    currentPhoto,
    expectedCacheIdentity,
    hydratedCache,
    photoRevision,
    product,
    requestInFlight,
    setBackground,
    setPhase,
  ]);

  if (!availability.uiAvailable || !product) return null;

  const subjectPhoto: DrapeRoomPhotoView | null =
    currentPhoto && photoUrl
      ? {
          digest: currentPhoto.digest,
          previewUrl: photoUrl,
          width: currentPhoto.width,
          height: currentPhoto.height,
          byteSize: currentPhoto.byteSize,
        }
      : null;
  const candidateResult = results[activeBackground];
  const currentResult = isCurrentDrapeRoomResult({
    result: candidateResult,
    photo: currentPhoto,
    product,
    config,
    background: activeBackground,
  })
    ? (candidateResult ?? null)
    : null;
  const cachedBackgrounds = new Set(
    DRAPE_ROOM_BACKGROUNDS.filter((background) =>
      isCurrentDrapeRoomResult({
        result: results[background],
        photo: currentPhoto,
        product,
        config,
        background,
      }),
    ),
  );

  const handleClose = () => {
    close();
    restoreDrapeRoomTriggerFocus();
  };

  const handleOnboardingComplete = (action: DrapeRoomOnboardingAction) => {
    completeDrapeRoomOnboarding();
    setOnboardingComplete(true);
    setStatusMessage(
      action === "completed"
        ? "Your selected saree is ready in the Drape Room."
        : "Introduction skipped. Your selected saree is still ready.",
    );
  };

  const handlePhotoSelect = async (file: File) => {
    photoPreparation.current?.abort();
    const controller = new AbortController();
    photoPreparation.current = controller;
    let lastMilestone = 0;
    setIsPhotoBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setDrapeRoomProgressMessage("Preparing your photo locally: 0%…");
    try {
      const processed = await processUserPhoto(file, {
        signal: controller.signal,
        onProgress: (progress) => {
          const milestone = Math.min(
            100,
            Math.floor(Math.max(0, progress) / 20) * 20,
          );
          if (milestone <= lastMilestone) return;
          lastMilestone = milestone;
          if (photoPreparation.current === controller) {
            setDrapeRoomProgressMessage(
              `Preparing your photo locally: ${milestone}%…`,
            );
          }
        },
        onStage: (stage) => {
          if (
            stage === "checking-readiness" &&
            photoPreparation.current === controller
          ) {
            setDrapeRoomProgressMessage(
              "Checking your photo locally…",
            );
          }
        },
      });
      const saved = await drapeRoomStorage.replaceUserPhoto({
        blob: processed.blob,
        width: processed.width,
        height: processed.height,
        digest: processed.digest,
        readiness: processed.readiness,
      });
      clearResultUrls();
      setResults({});
      installPhoto(saved);
      notifyPhotoChanged();
      setPhase("ready");
      setStatusMessage(
        photoWarningCopy(processed.warnings) ??
          "Photo ready. Review the privacy disclosure before creating.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "That photo could not be prepared. Try another image.";
      setErrorMessage(message);
      throw error;
    } finally {
      if (photoPreparation.current === controller) {
        setDrapeRoomProgressMessage(null);
        photoPreparation.current = null;
        setIsPhotoBusy(false);
      }
    }
  };

  const handleConsentChange = (accepted: boolean) => {
    if (!consentIdentity) return;
    setDrapeRoomConsent(accepted, consentIdentity);
    updateConsentAccepted(accepted);
  };

  const handleClearLocalData = async () => {
    try {
      await drapeRoomStorage.clearAllData();
      clearResultUrls();
      setResults({});
      installPhoto(null);
      setHydratedCache(null);
      setPhase("ready");
      notifyPhotoChanged();
      setErrorMessage(null);
      setStatusMessage(
        "Your photo and locally saved Drape Room previews were removed.",
      );
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Your local Drape Room data could not be removed.",
      );
    }
  };

  const handleSave = (result: DrapeRoomResult) => {
    const anchor = document.createElement("a");
    anchor.href = result.previewUrl;
    anchor.download = `from-the-trunk-${product.productSlug}-nivi-drape.jpg`;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setStatusMessage("Your image download has started.");
  };

  const handleVisit = () => {
    const destination = `/collection/${product.productSlug}`;
    handleClose();
    if (pathname !== destination) router.push(destination);
  };

  return (
    <DrapeRoomStage
      open={isOpen}
      product={product}
      config={config}
      configStatus={configStatus}
      generationAvailable={generationAvailable}
      photoReady={photoReady}
      dailyQuota={dailyQuota}
      onboardingComplete={onboardingComplete}
      subjectPhoto={subjectPhoto}
      currentResult={currentResult}
      cachedBackgrounds={cachedBackgrounds}
      activeBackground={activeBackground}
      consentAccepted={consentAccepted}
      storageMode={
        operationalStorageMode === "memory" ? "memory" : "indexeddb"
      }
      isGenerating={phase === "generating"}
      isPhotoBusy={isPhotoBusy}
      isCacheChecking={Boolean(currentPhoto) && !cacheLookupReady}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      wishlistControl={
        <WishlistButton
          productId={product.productId}
          productName={product.productName}
          presentation="drape-room"
        />
      }
      addToCartControl={
        <AddToCartButton
          product={{
            id: product.productId,
            name: product.productName,
            slug: product.productSlug,
            pricePaise: product.pricePaise,
            originalPricePaise: product.originalPricePaise ?? null,
            detailsFabric: product.fabric,
            stockStatus: product.stockStatus,
            imageUrl: product.displayImageUrl,
          }}
          presentation="drape-room"
          analyticsSource="drape-room"
          // Drape Room -> Add to cart -> Drape Room closes -> Shopping Bag
          // opens. The bag auto-opens on any cart-quantity increase, so without
          // this the Sheet would mount on top of this still-open dialog: two
          // aria-modal surfaces, with the Drape Room subtree left inert and
          // unreachable by assistive technology.
          //
          // close() rather than handleClose(): the bag takes focus next, so the
          // trigger-focus restore in handleClose would fight it. The generated
          // preview stays in IndexedDB and reopens free from the AI-star.
          onAdded={close}
        />
      }
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
      onCompleteOnboarding={handleOnboardingComplete}
      onPhotoSelect={handlePhotoSelect}
      onConsentChange={handleConsentChange}
      onSelectCachedBackground={(background) => {
        if (!results[background]) return;
        setBackground(background);
        setStatusMessage(`${backgroundLabel(background)} loaded from this browser.`);
        setErrorMessage(null);
      }}
      onGenerate={generate}
      onClearLocalData={handleClearLocalData}
      onSaveResult={handleSave}
      onVisitProduct={handleVisit}
    />
  );
}

function photoWarningCopy(warnings: readonly PhotoGuidanceWarning[]): string | null {
  if (warnings.includes("very-small")) return "Photo ready. A larger photo may give a clearer preview.";
  if (warnings.includes("extreme-aspect")) return "Photo ready. A less heavily cropped photo may give a better preview.";
  if (warnings.includes("landscape")) return "Photo ready. Portrait framing may give a more natural preview.";
  return null;
}

function backgroundLabel(background: DrapeRoomBackground): string {
  return background.charAt(0).toUpperCase() + background.slice(1);
}
