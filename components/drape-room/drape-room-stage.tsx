"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DrapeRoomStorageMode } from "@/lib/drape-room/client/storage";
import type {
  DrapeRoomBackground,
  DrapeRoomConfigStatus,
  DrapeRoomDailyQuota,
  DrapeRoomPhotoView,
  PublicTryOnConfig,
} from "@/lib/drape-room/client/types";
import type { DrapeSaree } from "@/lib/drape-room/product";
import { DrapeRoomConfirmationDialog } from "./drape-room-confirmation-dialog";
import { DrapeRoomDialogShell } from "./drape-room-dialog-shell";
import { DrapeRoomLiveStatus } from "./drape-room-live-status";
import {
  DrapeRoomOnboarding,
  DrapeRoomOnboardingProgress,
  type DrapeRoomOnboardingAction,
} from "./drape-room-onboarding";
import { DrapeRoomResultView } from "./drape-room-result-view";
import { DrapeRoomSetupView } from "./drape-room-setup-view";
import {
  DRAPE_ROOM_BACKGROUNDS,
  type DrapeRoomMaybePromise,
  type DrapeRoomResult,
} from "./types";

export interface DrapeRoomStageProps {
  open: boolean;
  product: DrapeSaree;
  config: PublicTryOnConfig | null;
  configStatus: DrapeRoomConfigStatus;
  generationAvailable: boolean;
  photoReady: boolean;
  dailyQuota: DrapeRoomDailyQuota | null;
  onboardingComplete: boolean;
  subjectPhoto: DrapeRoomPhotoView | null;
  currentResult: DrapeRoomResult | null;
  cachedBackgrounds: ReadonlySet<DrapeRoomBackground>;
  activeBackground: DrapeRoomBackground;
  consentAccepted: boolean;
  storageMode: DrapeRoomStorageMode;
  isGenerating: boolean;
  isPhotoBusy: boolean;
  isCacheChecking: boolean;
  statusMessage?: string | null;
  errorMessage?: string | null;
  wishlistControl?: React.ReactNode;
  addToCartControl?: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onCompleteOnboarding: (action: DrapeRoomOnboardingAction) => void;
  onPhotoSelect: (file: File) => Promise<void>;
  onConsentChange: (accepted: boolean) => void;
  onSelectCachedBackground: (background: DrapeRoomBackground) => void;
  onGenerate: (background: DrapeRoomBackground) => DrapeRoomMaybePromise<void>;
  onClearLocalData: () => DrapeRoomMaybePromise<void>;
  onSaveResult: (result: DrapeRoomResult) => DrapeRoomMaybePromise<void>;
  onVisitProduct: (product: DrapeSaree) => DrapeRoomMaybePromise<void>;
}

export function DrapeRoomStage({
  open,
  product,
  config,
  configStatus,
  generationAvailable,
  photoReady,
  dailyQuota,
  onboardingComplete,
  subjectPhoto,
  currentResult,
  cachedBackgrounds,
  activeBackground,
  consentAccepted,
  storageMode,
  isGenerating,
  isPhotoBusy,
  isCacheChecking,
  statusMessage,
  errorMessage,
  wishlistControl,
  addToCartControl,
  onOpenChange,
  onCompleteOnboarding,
  onPhotoSelect,
  onConsentChange,
  onSelectCachedBackground,
  onGenerate,
  onClearLocalData,
  onSaveResult,
  onVisitProduct,
}: DrapeRoomStageProps) {
  const generationAllowed =
    generationAvailable && photoReady && dailyQuota?.remaining !== 0;
  const uploadId = React.useId();
  const consentId = React.useId();
  const [pendingBackground, setPendingBackground] =
    React.useState<DrapeRoomBackground | null>(null);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [photoSelectedThisVisit, setPhotoSelectedThisVisit] =
    React.useState(false);
  const [showFirstVisitSetup, setShowFirstVisitSetup] = React.useState(false);
  const [localPhotoMessage, setLocalPhotoMessage] = React.useState<
    string | null
  >(null);
  const hasOpenConfirmation =
    pendingBackground !== null ||
    confirmReplace ||
    confirmClear;
  const confirmationDismissGuard = React.useRef(false);

  React.useEffect(() => {
    if (hasOpenConfirmation) {
      confirmationDismissGuard.current = true;
      return;
    }
    if (!confirmationDismissGuard.current) return;

    // Radix keeps a closing layer mounted for its 200ms exit animation. Keep
    // the parent guarded until that sibling portal has fully left the stack.
    const timeout = window.setTimeout(() => {
      confirmationDismissGuard.current = false;
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [hasOpenConfirmation]);

  const handlePhoto = async (file: File) => {
    setLocalPhotoMessage("Preparing your photo locally in this browser…");
    try {
      await onPhotoSelect(file);
      setPhotoSelectedThisVisit(true);
      setLocalPhotoMessage(
        "Photo ready. Review the disclosure and consent before creating.",
      );
    } catch (error) {
      setLocalPhotoMessage(
        error instanceof Error
          ? error.message
          : "That photo could not be prepared.",
      );
    }
  };

  const finishOnboarding = (action: DrapeRoomOnboardingAction) => {
    setShowFirstVisitSetup(true);
    onCompleteOnboarding(action);
  };

  const handlePresentationOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && confirmationDismissGuard.current) return;
    if (!nextOpen && !onboardingComplete) {
      finishOnboarding("dismissed");
      return;
    }
    if (!nextOpen) setShowFirstVisitSetup(false);
    onOpenChange(nextOpen);
  };

  const requestBackground = (background: DrapeRoomBackground) => {
    if (background === activeBackground) return;
    if (cachedBackgrounds.has(background)) {
      onSelectCachedBackground(background);
      return;
    }
    if (!generationAllowed) return;
    setPendingBackground(background);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handlePresentationOpenChange}>
        <DrapeRoomDialogShell
          aria-describedby="drape-room-description"
          onPointerDownOutside={(event) => {
            // Nested confirmation and wishlist/auth dialogs render in sibling
            // Radix portals. Never treat interaction with a top-most layer as
            // an instruction to close the owning Drape Room. X and Escape
            // remain the deliberate dismissal controls for this experience.
            event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (confirmationDismissGuard.current) event.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">
            AI Drape Room for {product.productName}
          </DialogTitle>
          <DialogDescription id="drape-room-description" className="sr-only">
            Preview this saree in a fixed Classic Nivi drape. No image is
            generated until you explicitly create a preview or confirm a new
            background.
          </DialogDescription>

          {!onboardingComplete ? (
            <DrapeRoomOnboarding
              product={product}
              subjectPhoto={subjectPhoto}
              isPhotoBusy={isPhotoBusy}
              photoMessage={localPhotoMessage}
              onPhotoSelect={handlePhoto}
              onComplete={finishOnboarding}
            />
          ) : (
            <>
              <header className="shrink-0 border-b border-ftt-border bg-ftt-card/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-14 backdrop-blur @sm:px-6 @sm:pr-16">
                {showFirstVisitSetup && !currentResult ? (
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <DrapeRoomOnboardingProgress currentStep={3} />
                    <div className="min-w-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ftt-burgundy/60">
                        Classic Nivi
                      </p>
                      <p className="max-w-44 truncate font-serif text-lg">
                        {product.productName}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ftt-navy text-ftt-gold">
                      <Sparkles className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/65">
                        AI Drape Room · Classic Nivi
                      </p>
                      <p className="truncate font-serif text-lg @sm:text-xl">
                        {product.productName}
                      </p>
                    </div>
                  </div>
                )}
              </header>

              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
                {currentResult ? (
                  <DrapeRoomResultView
                    product={product}
                    result={currentResult}
                    activeBackground={activeBackground}
                    cachedBackgrounds={cachedBackgrounds}
                    generationAvailable={generationAllowed}
                    remainingGenerations={dailyQuota?.remaining ?? 3}
                    generationBlockedReason={
                      dailyQuota?.remaining === 0
                        ? "You have used today’s three previews for this saree. Your saved images remain available, and you can create more after midnight."
                        : !photoReady
                          ? "Choose a clear, full-body photo of one person before creating another preview."
                          : !generationAvailable
                            ? undefined
                            : null
                    }
                    isGenerating={isGenerating}
                    isCacheChecking={isCacheChecking}
                    wishlistControl={wishlistControl}
                    addToCartControl={addToCartControl}
                    onBackgroundSelect={requestBackground}
                    onSave={() => void onSaveResult(currentResult)}
                    onVisit={() => void onVisitProduct(product)}
                  />
                ) : (
                  <DrapeRoomSetupView
                    product={product}
                    config={config}
                    configStatus={configStatus}
                    generationAvailable={generationAvailable}
                    photoReady={photoReady}
                    remainingGenerations={dailyQuota?.remaining ?? 3}
                    subjectPhoto={subjectPhoto}
                    consentAccepted={consentAccepted}
                    isGenerating={isGenerating}
                    isPhotoBusy={isPhotoBusy}
                    isCacheChecking={isCacheChecking}
                    storageMode={storageMode}
                    uploadId={uploadId}
                    consentId={consentId}
                    photoSelectedThisVisit={photoSelectedThisVisit}
                    onPhotoSelect={handlePhoto}
                    onAskReplace={() => setConfirmReplace(true)}
                    onConsentChange={onConsentChange}
                    onCreate={() => void onGenerate("studio")}
                    onClear={() => setConfirmClear(true)}
                  />
                )}
              </div>

              <DrapeRoomLiveStatus
                errorMessage={errorMessage}
                statusMessage={statusMessage}
                storageMode={storageMode}
              />
            </>
          )}
        </DrapeRoomDialogShell>
      </Dialog>

      <DrapeRoomConfirmationDialog
        open={pendingBackground !== null}
        title={`Create the ${backgroundLabel(pendingBackground ?? "studio")} setting?`}
        description={`This background has not been created for this photo and saree. Creating it uses 1 of your ${dailyQuota?.remaining ?? 3} remaining AI generations today. Your saved ${backgroundLabel(activeBackground)} preview will remain available.`}
        cancelLabel="Keep current preview"
        confirmLabel="Use 1 generation"
        isBusy={isGenerating}
        onCancel={() => setPendingBackground(null)}
        onConfirm={() => {
          const background = pendingBackground;
          setPendingBackground(null);
          if (background && generationAllowed) {
            void onGenerate(background);
          }
        }}
      />
      <DrapeRoomConfirmationDialog
        open={confirmReplace}
        title="Replace your photo?"
        description="Changing your photo will remove the AI previews saved in this browser for the current photo. Nothing will be generated automatically, and your daily generation limit will not reset. After the new photo passes the local check, choose Create preview with new photo to use 1 generation."
        confirmLabel="Choose new photo"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          setConfirmReplace(false);
          document.getElementById(uploadId)?.click();
        }}
      />
      <DrapeRoomConfirmationDialog
        open={confirmClear}
        title="Clear my try-on data?"
        description="Remove your photo and locally saved drape previews from this browser? This will not affect your account, wishlist, cart, reservations, orders, addresses, or products."
        confirmLabel="Clear my try-on data"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void onClearLocalData();
        }}
      />
    </>
  );
}

function backgroundLabel(background: DrapeRoomBackground): string {
  return (
    DRAPE_ROOM_BACKGROUNDS.find((option) => option.id === background)?.label ??
    background
  );
}
