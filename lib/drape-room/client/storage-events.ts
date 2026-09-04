"use client";

const STORAGE_CHANNEL_NAME = "ftt_drape_room_storage_v1";

export type DrapeRoomStorageChangeType =
  | "user-photo-updated"
  | "user-photo-deleted"
  | "render-updated"
  | "render-accessed"
  | "render-deleted"
  | "renders-pruned"
  | "renders-cleared"
  | "metadata-updated"
  | "metadata-deleted"
  | "preferences-updated"
  | "all-cleared";

export interface DrapeRoomStorageChange {
  type: DrapeRoomStorageChangeType;
  key?: string;
  at: number;
  sourceId: string;
}

const listeners = new Set<(change: DrapeRoomStorageChange) => void>();
const sourceId = createSourceId();
let channel: BroadcastChannel | null | undefined;

export function subscribeToDrapeRoomStorageChanges(
  listener: (change: DrapeRoomStorageChange) => void,
): () => void {
  listeners.add(listener);
  getChannel();
  return () => listeners.delete(listener);
}

export function closeDrapeRoomStorageNotifications(): void {
  channel?.close();
  channel = undefined;
  listeners.clear();
}

export function notifyDrapeRoomStorageChange(
  type: DrapeRoomStorageChangeType,
  key?: string,
): void {
  const change: DrapeRoomStorageChange = {
    type,
    ...(key ? { key } : {}),
    at: Date.now(),
    sourceId,
  };
  listeners.forEach((listener) => listener(change));
  getChannel()?.postMessage(change);
}

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (
    typeof window === "undefined" ||
    typeof window.BroadcastChannel !== "function"
  ) {
    channel = null;
    return null;
  }
  channel = new window.BroadcastChannel(STORAGE_CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const change = event.data;
    if (!isStorageChange(change) || change.sourceId === sourceId) return;
    listeners.forEach((listener) => listener(change));
  });
  return channel;
}

function isStorageChange(value: unknown): value is DrapeRoomStorageChange {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DrapeRoomStorageChange>;
  return (
    typeof record.type === "string" &&
    [
      "user-photo-updated",
      "user-photo-deleted",
      "render-updated",
      "render-accessed",
      "render-deleted",
      "renders-pruned",
      "renders-cleared",
      "metadata-updated",
      "metadata-deleted",
      "preferences-updated",
      "all-cleared",
    ].includes(record.type) &&
    (record.key === undefined || typeof record.key === "string") &&
    typeof record.at === "number" &&
    Number.isSafeInteger(record.at) &&
    record.at >= 0 &&
    typeof record.sourceId === "string" &&
    record.sourceId.length > 0
  );
}

function createSourceId(): string {
  try {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `tab-${Math.random().toString(36).slice(2)}`
    );
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}
