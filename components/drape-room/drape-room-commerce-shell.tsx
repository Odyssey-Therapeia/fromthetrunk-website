"use client";

import { CommerceProviders } from "@/components/providers";
import type { DrapeRoomClientTransport } from "@/lib/drape-room/client/api";
import type { DrapeRoomAvailability } from "@/lib/drape-room/client/types";
import { DrapeRoomExperience } from "./drape-room-experience";

export interface DrapeRoomCommerceShellProps {
  availability: DrapeRoomAvailability;
  transport: DrapeRoomClientTransport;
  onRefreshConfig: () => Promise<void>;
}

export function DrapeRoomCommerceShell({
  availability,
  transport,
  onRefreshConfig,
}: DrapeRoomCommerceShellProps) {
  return (
    <CommerceProviders>
      <DrapeRoomExperience
        availability={availability}
        transport={transport}
        onRefreshConfig={onRefreshConfig}
      />
    </CommerceProviders>
  );
}
