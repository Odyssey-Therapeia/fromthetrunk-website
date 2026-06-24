import { Shape, ShapeStream } from "@electric-sql/client";
import { useEffect, useState } from "react";

type ElectricMode = "electric" | "polling";

type UseElectricShapeRowsOptions<T> = {
  enabled?: boolean;
  fallbackFetch: () => Promise<T[]>;
  immediateFallbackFetch?: boolean;
  initialRows?: T[];
  mapRows: (rows: unknown[]) => T[];
  pollIntervalMs?: number;
  pollWhenHidden?: boolean;
  shapeParams?: Record<string, string | string[]>;
  table: string;
};

const shapeServiceUrl =
  process.env.NEXT_PUBLIC_ELECTRIC_SHAPE_URL?.trim() || "";

export const useElectricShapeRows = <T>({
  enabled = true,
  fallbackFetch,
  immediateFallbackFetch = true,
  initialRows = [],
  mapRows,
  pollIntervalMs = 12_000,
  pollWhenHidden = true,
  shapeParams = {},
  table,
}: UseElectricShapeRowsOptions<T>) => {
  const [mode, setMode] = useState<ElectricMode>(
    shapeServiceUrl ? "electric" : "polling",
  );
  const [rows, setRows] = useState<T[]>(initialRows);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;
    let unsubscribe: null | (() => void) = null;
    let removeVisibilityListener: null | (() => void) = null;

    const canPollNow = () =>
      pollWhenHidden ||
      typeof document === "undefined" ||
      document.visibilityState === "visible";

    const runFallbackFetch = async () => {
      if (!canPollNow()) return;
      try {
        const fallbackRows = await fallbackFetch();
        if (!cancelled) {
          setRows(fallbackRows);
        }
      } catch {
        // Ignore fallback fetch errors to keep UI resilient.
      }
    };

    const startPolling = async () => {
      if (!cancelled) {
        setMode("polling");
      }
      if (immediateFallbackFetch) {
        await runFallbackFetch();
      }
      interval = setInterval(() => {
        void runFallbackFetch();
      }, pollIntervalMs);
      if (!pollWhenHidden && typeof document !== "undefined") {
        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void runFallbackFetch();
          }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        removeVisibilityListener = () => {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
      }
    };

    if (!shapeServiceUrl) {
      void startPolling();
      return () => {
        cancelled = true;
        if (interval) clearInterval(interval);
        removeVisibilityListener?.();
      };
    }

    try {
      const stream = new ShapeStream({
        params: {
          table,
          ...shapeParams,
        },
        url: `${shapeServiceUrl.replace(/\/$/, "")}/v1/shape`,
      });
      const shape = new Shape(stream);

      void shape.rows
        .then((initialShapeRows) => {
          if (!cancelled) {
            setMode("electric");
            setRows(mapRows(initialShapeRows as unknown[]));
          }
        })
        .catch(async () => {
          await startPolling();
        });

      unsubscribe = shape.subscribe(
        ({ rows: liveRows }: { rows: unknown[] }) => {
          if (cancelled) return;
          setMode("electric");
          setRows(mapRows(liveRows));
        },
      );
    } catch {
      void startPolling();
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      removeVisibilityListener?.();
      unsubscribe?.();
    };
  }, [
    enabled,
    fallbackFetch,
    immediateFallbackFetch,
    mapRows,
    pollIntervalMs,
    pollWhenHidden,
    shapeParams,
    table,
  ]);

  return {
    mode,
    rows,
  };
};
