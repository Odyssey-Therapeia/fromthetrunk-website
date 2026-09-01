"use client";

import * as React from "react";

import type { DrapeRoomStorageMode } from "@/lib/drape-room/client/storage";

let progressMessage: string | null = null;
const progressListeners = new Set<() => void>();

export function setDrapeRoomProgressMessage(message: string | null): void {
  if (progressMessage === message) return;
  progressMessage = message;
  progressListeners.forEach((listener) => listener());
}

function subscribeToDrapeRoomProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

function getDrapeRoomProgressMessage(): string | null {
  return progressMessage;
}

export function DrapeRoomLiveStatus({
  errorMessage,
  statusMessage,
  storageMode,
}: {
  errorMessage?: string | null;
  statusMessage?: string | null;
  storageMode: DrapeRoomStorageMode;
}) {
  const progress = React.useSyncExternalStore(
    subscribeToDrapeRoomProgress,
    getDrapeRoomProgressMessage,
    () => null,
  );

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="shrink-0 border-t border-ftt-border bg-ftt-card px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] leading-4 @sm:px-6"
    >
      {errorMessage ? (
        <p role="alert" className="font-medium text-destructive">
          {errorMessage}
        </p>
      ) : progress ?? statusMessage ? (
        <p role="status" className="text-ftt-burgundy/75">
          {progress ?? statusMessage}
        </p>
      ) : storageMode === "memory" ? (
        <p role="status" className="text-ftt-burgundy/75">
          This preview could not be saved in your browser and may disappear when
          you close or refresh the page.
        </p>
      ) : (
        <p className="text-ftt-burgundy/55">
          Opening, uploading, and viewing a cached result do not generate an
          image.
        </p>
      )}
    </div>
  );
}
