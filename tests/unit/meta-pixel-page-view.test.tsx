// @vitest-environment jsdom

import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetaPixelPageView } from "@/components/analytics/meta-pixel-page-view";
import * as pixel from "@/lib/analytics/meta-pixel";

const navigation = vi.hoisted(() => ({
  pathname: "/" as string | null,
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

const PIXEL_ID = "1368141865250071";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const win = window as unknown as pixel.MetaPixelWindow;
let container: HTMLDivElement;
let root: Root;

function pageViews() {
  return (win.fbq?.queue ?? []).filter(
    ([command, event]) => command === "track" && event === "PageView",
  );
}

function eventIds() {
  return pageViews().map((event) => (event[3] as { eventID: string }).eventID);
}

async function renderPage(pathname = "/", query = "") {
  navigation.pathname = pathname;
  // A new searchParams object exercises effect reruns even for the same URL.
  navigation.searchParams = new URLSearchParams(query);
  await act(async () => {
    root.render(<StrictMode><MetaPixelPageView /></StrictMode>);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  delete win.fbq;
  delete win._fbq;
  pixel.initMetaPixel(win, PIXEL_ID);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete win.fbq;
  delete win._fbq;
  vi.unstubAllGlobals();
});

describe("Meta PageView navigation IDs", () => {
  it("sends one UUID-bearing event through Strict Mode and same-URL rerenders", async () => {
    await renderPage();
    const [eventId] = eventIds();
    expect(eventId).toMatch(UUID);

    await renderPage();
    await renderPage();

    expect(pageViews()).toEqual([["track", "PageView", {}, { eventID: eventId }]]);
  });

  it("uses new IDs for routes, query changes, and returning to an earlier URL", async () => {
    await renderPage();
    await renderPage("/collection");
    await renderPage("/collection", "color=red");
    await renderPage("/collection", "color=red");
    await renderPage();

    const ids = eventIds();
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    ids.forEach((id) => expect(id).toMatch(UUID));
  });

  it("retains the ID when a later effect retries after initialization", async () => {
    delete win.fbq;
    delete win._fbq;
    const track = vi.spyOn(pixel, "trackMetaPageView");
    await renderPage();
    expect(pageViews()).toHaveLength(0);
    const pendingId = track.mock.calls[0][1];
    expect(pendingId).toMatch(UUID);

    pixel.initMetaPixel(win, PIXEL_ID);
    await renderPage();

    expect(eventIds()).toEqual([pendingId]);
    expect(track.mock.calls.every(([, id]) => id === pendingId)).toBe(true);
  });

  it("replays queued navigation IDs unchanged and only once when the library loads", async () => {
    await renderPage();
    await renderPage("/collection");
    const queued = pageViews();
    const sent = vi.fn();
    win.fbq!.callMethod = sent;

    pixel.flushMetaPixelQueue(win);
    pixel.flushMetaPixelQueue(win);
    await renderPage("/collection");

    expect(sent.mock.calls.filter(([command]) => command === "track")).toEqual(queued);
    expect(pageViews()).toHaveLength(0);
  });

  it("uses a fresh ID after the tracker unmounts and mounts again", async () => {
    await renderPage();
    const [firstId] = eventIds();
    await act(async () => root.render(null));
    await renderPage();

    expect(eventIds()).toHaveLength(2);
    expect(eventIds()[1]).toMatch(UUID);
    expect(eventIds()[1]).not.toBe(firstId);
  });

  it("leaves a foreign Pixel untouched", async () => {
    const foreign = vi.fn();
    win.fbq = foreign;
    await renderPage();
    await renderPage("/collection");

    expect(foreign).not.toHaveBeenCalled();
  });
});
