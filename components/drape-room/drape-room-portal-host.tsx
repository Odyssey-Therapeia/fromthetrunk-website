"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import {
  browserDrapeRoomTransport,
  type DrapeRoomClientTransport,
} from "@/lib/drape-room/client/api";
import {
  isDrapeRoomConfigFresh,
  millisecondsUntilDrapeRoomConfigRefresh,
} from "@/lib/drape-room/client/config-cache";
import {
  useDrapeRoomOperationalStore,
} from "@/lib/drape-room/client/store";
import type {
  DrapeRoomAvailability,
  DrapeRoomConfigSnapshot,
  DrapeRoomConfigStatus,
} from "@/lib/drape-room/client/types";
import type { DrapeRoomCommerceShellProps } from "./drape-room-commerce-shell";

const LazyDrapeRoomCommerceShell = dynamic<DrapeRoomCommerceShellProps>(
  () =>
    import("./drape-room-commerce-shell").then(
      (module) => module.DrapeRoomCommerceShell,
    ),
  { ssr: false, loading: () => null },
);

export interface DrapeRoomPortalHostProps {
  /** Server-derived boolean only; avoids a disabled no-store route invocation. */
  enabledHint?: boolean;
  /** Test seam; production uses the same-origin client transport. */
  transport?: DrapeRoomClientTransport;
  /** Test seam for the five-minute config freshness window. */
  now?: () => number;
}

/** Tiny global host. Heavy UI/auth/query code loads only after first activation. */
export function DrapeRoomPortalHost({
  enabledHint = false,
  transport = browserDrapeRoomTransport,
  now = Date.now,
}: DrapeRoomPortalHostProps = {}) {
  const isOpen = useDrapeRoomOperationalStore((state) => state.isOpen);
  const activeRequestId = useDrapeRoomOperationalStore(
    (state) => state.activeRequestId,
  );
  const selectedSaree = useDrapeRoomOperationalStore(
    (state) => state.selectedSaree,
  );
  const setUiAvailability = useDrapeRoomOperationalStore(
    (state) => state.setUiAvailability,
  );
  const [configSnapshot, setConfigSnapshot] =
    React.useState<DrapeRoomConfigSnapshot | null>(null);
  const [configLoadedAt, setConfigLoadedAt] = React.useState(0);
  const [configStatus, setConfigStatus] = React.useState<DrapeRoomConfigStatus>(
    enabledHint ? "idle" : "unavailable",
  );
  const [activated, setActivated] = React.useState(false);
  const mounted = React.useRef(true);
  const refreshPromise = React.useRef<Promise<void> | null>(null);
  const previousOpen = React.useRef(false);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen || activated) return;
    const frame = window.requestAnimationFrame(() => setActivated(true));
    return () => window.cancelAnimationFrame(frame);
  }, [activated, isOpen]);

  const refreshConfig = React.useCallback((): Promise<void> => {
    if (refreshPromise.current) return refreshPromise.current;

    let request: Promise<void>;
    setConfigStatus("loading");
    request = transport
      .loadConfig()
      .then((nextConfig) => {
        if (!mounted.current) return;
        if (!nextConfig?.config.enabled) {
          throw new Error("Drape Room is unavailable.");
        }
        setConfigSnapshot(nextConfig);
        setConfigLoadedAt(now());
        setConfigStatus("ready");
      })
      .catch(() => {
        if (!mounted.current) return;
        const state = useDrapeRoomOperationalStore.getState();
        if (state.activeRequestId) return;
        setConfigSnapshot(null);
        setConfigLoadedAt(0);
        setConfigStatus("unavailable");
      })
      .finally(() => {
        if (refreshPromise.current === request) refreshPromise.current = null;
      });
    refreshPromise.current = request;
    return request;
  }, [now, transport]);

  React.useEffect(() => {
    if (!enabledHint) {
      const state = useDrapeRoomOperationalStore.getState();
      if (!state.activeRequestId) {
        setUiAvailability(false);
      }
      return;
    }
    // The server flag controls storefront discoverability. Provider, budget,
    // consent and reference readiness remain separate fail-closed gates.
    setUiAvailability(true);
  }, [enabledHint, setUiAvailability]);

  React.useEffect(() => {
    const reopened = isOpen && !previousOpen.current;
    previousOpen.current = isOpen;
    if (!enabledHint || !reopened) return;
    if (useDrapeRoomOperationalStore.getState().activeRequestId) return;
    if (
      configStatus === "idle" ||
      !isDrapeRoomConfigFresh(configLoadedAt, now())
    ) {
      void refreshConfig();
    }
  }, [
    configLoadedAt,
    configStatus,
    enabledHint,
    isOpen,
    now,
    refreshConfig,
  ]);

  React.useEffect(() => {
    if (
      !enabledHint ||
      !isOpen ||
      activeRequestId ||
      configStatus !== "ready" ||
      configLoadedAt <= 0
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void refreshConfig();
    }, millisecondsUntilDrapeRoomConfigRefresh(configLoadedAt, now()));
    return () => window.clearTimeout(timeout);
  }, [
    activeRequestId,
    configLoadedAt,
    configStatus,
    enabledHint,
    isOpen,
    now,
    refreshConfig,
  ]);

  // One-way activation keeps request ownership mounted after presentation closes.
  if (!activated) return null;
  const activeRequest = Boolean(activeRequestId);
  if (!enabledHint && !activeRequest) return null;
  const configReady =
    configStatus === "ready" && configSnapshot?.config.enabled === true;
  const availability: DrapeRoomAvailability = {
    uiAvailable: true,
    configStatus,
    generationAvailable:
      configReady && selectedSaree?.generationReady !== false,
    config: configReady ? configSnapshot.config : null,
    consentToken: configReady ? configSnapshot.consentToken : null,
  };

  return (
    <LazyDrapeRoomCommerceShell
      availability={availability}
      transport={transport}
      onRefreshConfig={refreshConfig}
    />
  );
}
