"use client";

import { useEffect } from "react";

import { trackOncePerSession } from "@/lib/analytics/client";
import type { AnalyticsEventType } from "@/lib/ports/analytics-sink";

type WebsitePageViewMetric = Extract<
  AnalyticsEventType,
  "collection_view" | "search_performed" | "filter_applied"
>;

export function TrackPageView({
  eventKey,
  payload,
  type,
}: {
  eventKey: string;
  payload?: Record<string, unknown>;
  type: WebsitePageViewMetric;
}) {
  useEffect(() => {
    trackOncePerSession(eventKey, type, payload ?? {});
  }, [eventKey, payload, type]);

  return null;
}
