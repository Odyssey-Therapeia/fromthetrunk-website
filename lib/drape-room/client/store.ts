"use client";

import { create } from "zustand";

import type { DrapeSaree } from "@/lib/drape-room/product";
import type { DrapeRoomStorageMode } from "./storage";
import type { DrapeRoomBackground } from "./types";

export type DrapeRoomPhase =
  | "idle"
  | "preparing-photo"
  | "ready"
  | "checking-cache"
  | "generating"
  | "complete"
  | "error";

export interface DrapeRoomOperationalState {
  isOpen: boolean;
  drapeUiAvailable: boolean;
  configHydrated: boolean;
  selectedSaree: DrapeSaree | null;
  background: DrapeRoomBackground;
  phase: DrapeRoomPhase;
  storageMode: DrapeRoomStorageMode | "checking";
  activeRequestId: string | null;
  errorCode: string | null;
  photoRevision: number;
  open: (product: DrapeSaree, opener?: HTMLElement | null) => void;
  reopen: () => void;
  close: () => void;
  setUiAvailability: (available: boolean) => void;
  setBackground: (background: DrapeRoomBackground) => void;
  setPhase: (phase: DrapeRoomPhase) => void;
  setStorageMode: (storageMode: DrapeRoomStorageMode) => void;
  setActiveRequestId: (requestId: string | null) => void;
  setProductReferenceVersion: (version: string) => void;
  fail: (errorCode: string) => void;
  clearError: () => void;
  notifyPhotoChanged: () => void;
}

/**
 * Non-persisted coordination only. Selected product metadata and request IDs
 * are deliberately small; image bytes and object URLs stay in IndexedDB or
 * component-local memory.
 */
export const useDrapeRoomOperationalStore =
  create<DrapeRoomOperationalState>()((set, get) => ({
    isOpen: false,
    drapeUiAvailable: false,
    configHydrated: false,
    selectedSaree: null,
    background: "studio",
    phase: "idle",
    storageMode: "checking",
    activeRequestId: null,
    errorCode: null,
    photoRevision: 0,
    open: (product, opener) => {
      if (opener) focusReturnTarget = opener;
      if (
        get().activeRequestId &&
        get().selectedSaree?.productId !== product.productId
      ) {
        set({ isOpen: true });
        return;
      }
      const isDifferentProduct =
        get().selectedSaree?.productId !== product.productId;
      set({
        isOpen: true,
        selectedSaree: product,
        ...(isDifferentProduct
          ? {
              background: "studio" as const,
              phase: "ready" as const,
              errorCode: null,
            }
          : {}),
      });
    },
    reopen: () => {
      if (get().selectedSaree) set({ isOpen: true });
    },
    // Closing presentation must not cancel or reset an active request.
    close: () => set({ isOpen: false }),
    setUiAvailability: (drapeUiAvailable) =>
      set({ drapeUiAvailable, configHydrated: true }),
    setBackground: (background) => set({ background }),
    setPhase: (phase) => set({ phase, errorCode: null }),
    setStorageMode: (storageMode) => set({ storageMode }),
    setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
    setProductReferenceVersion: (productReferenceVersion) =>
      set((state) => ({
        selectedSaree: state.selectedSaree
          ? { ...state.selectedSaree, productReferenceVersion }
          : null,
      })),
    fail: (errorCode) => set({ phase: "error", errorCode }),
    clearError: () => set({ errorCode: null }),
    notifyPhotoChanged: () =>
      set((state) => ({ photoRevision: state.photoRevision + 1 })),
  }));

let focusReturnTarget: HTMLElement | null = null;

export function setDrapeRoomFocusReturnTarget(target: HTMLElement | null): void {
  focusReturnTarget = target;
}

export function restoreDrapeRoomTriggerFocus(): void {
  const target = focusReturnTarget;
  focusReturnTarget = null;
  if (!target?.isConnected) return;
  requestAnimationFrame(() => target.focus({ preventScroll: true }));
}
