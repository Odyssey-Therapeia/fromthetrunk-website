import type { DrapeSaree } from "@/lib/drape-room/product";
import {
  type DrapeRoomBackground,
  type DrapeRoomMaybePromise,
  type DrapeRoomPhotoView,
  type DrapeRoomRenderView,
} from "@/lib/drape-room/client/types";

export const CLASSIC_NIVI_DRAPE = {
  id: "nivi",
  label: "Classic Nivi",
  description: "Pleated at the waist with the pallu over the left shoulder.",
} as const;

export const DRAPE_ROOM_MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export const DRAPE_ROOM_BACKGROUNDS = [
  {
    id: "studio",
    label: "Studio",
    description: "Warm ivory, neutral luxury editorial studio",
  },
  {
    id: "festival",
    label: "Festival",
    description: "Restrained festive décor and warm light",
  },
  {
    id: "wedding",
    label: "Wedding",
    description: "Refined wedding venue and floral décor",
  },
  {
    id: "party",
    label: "Party",
    description: "Tasteful evening celebration",
  },
  {
    id: "birthday",
    label: "Birthday",
    description: "Elegant, subtle birthday setting",
  },
] as const;

export interface DrapeRoomResult extends DrapeRoomRenderView {
  blob: Blob;
  userPhotoDigest: string;
  productReferenceVersion: string;
  referenceContractVersion: "gallery-v2";
  provider: string;
  model: string;
  promptVersion: string;
  engineVersion: string;
  outputVersion: string;
}

export function formatDrapeRoomPrice(pricePaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(pricePaise / 100);
}

export type {
  DrapeSaree,
  DrapeRoomBackground,
  DrapeRoomMaybePromise,
  DrapeRoomPhotoView,
};
