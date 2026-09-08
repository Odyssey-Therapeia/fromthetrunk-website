import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DRAPE_ROOM_DRAPING_COMPLETE,
  DRAPE_ROOM_DRAPING_STEPS,
} from "@/components/drape-room/drape-room-copy";
import { DrapeRoomProgressButton } from "@/components/drape-room/drape-room-progress-button";

const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const render = (state: "idle" | "checking" | "generating" | "complete") =>
  renderToStaticMarkup(
    <DrapeRoomProgressButton
      state={state}
      onClick={() => undefined}
      idleLabel="Create my drape"
      checkingLabel="Checking saved previews…"
    />,
  );

describe("Drape Room create button", () => {
  it("rests with the idle label and no fill", () => {
    const html = render("idle");

    expect(html).toContain("Create my drape");
    expect(html).not.toContain("data-drape-progress-fill");
  });

  it("lands on a full fill once the request succeeds", () => {
    const html = render("complete");

    expect(html).toContain(DRAPE_ROOM_DRAPING_COMPLETE);
    expect(html).toContain("width:100%");
  });

  it("narrates the drape in step order", () => {
    expect(DRAPE_ROOM_DRAPING_STEPS.map((step) => step.label)).toEqual([
      "Draping…",
      "Making the pleats…",
      "Setting the pallu…",
      "Smoothing the fall…",
      "Almost draped…",
    ]);

    const bands = DRAPE_ROOM_DRAPING_STEPS.map((step) => step.upTo);
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
    expect(bands.at(-1)).toBe(100);
  });

  it("waits at the ceiling instead of inventing the last stretch", () => {
    // Generation is one awaited request with no progress events, so the bar
    // must never reach 100% before the provider answers.
    const component = source(
      "components/drape-room/drape-room-progress-button.tsx",
    );

    expect(component).toContain("const PROGRESS_CEILING = 92;");
    expect(component).toContain(
      "current + (PROGRESS_CEILING - current) * APPROACH_RATE",
    );
    // A synthetic number must not be announced as a measured one.
    expect(component).not.toContain("aria-valuenow");
    expect(component).not.toContain('role="progressbar"');
  });

  it("turns the pill into the unfilled track so the fill is visible", () => {
    // The resting button is already burgundy; a burgundy fill on burgundy
    // would show nothing.
    const html = renderToStaticMarkup(
      <DrapeRoomProgressButton
        state="complete"
        onClick={() => undefined}
        idleLabel="Create my drape"
        checkingLabel="Checking saved previews…"
        className="bg-ftt-burgundy disabled:opacity-50"
      />,
    );

    expect(html).toContain("bg-ftt-burgundy/45");
    expect(html).toContain("disabled:opacity-100");
    expect(html).not.toMatch(/class="[^"]*disabled:opacity-50/);
  });

  it("keeps one accessible name while the visible label changes", () => {
    const html = render("generating");

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Creating your drape"');
    expect(html).toMatch(/aria-hidden="true"[^>]*>Draping…/);
  });

  it("holds the fill at full before the preview replaces the setup view", () => {
    const hook = source("components/drape-room/use-drape-room-generation.ts");

    expect(hook).toContain("const COMPLETION_BEAT_MS = 420;");
    // The phase flips complete before the result commits, or the button
    // unmounts mid-fill.
    expect(hook.indexOf('setPhase("complete")')).toBeLessThan(
      hook.indexOf("setResults((current) => ({"),
    );
  });

  it("stills the sheen for reduced motion", () => {
    const css = source("app/globals.css");
    const sheen = css.slice(css.indexOf("@keyframes ftt-drape-fill-sheen"));

    expect(sheen).toContain("@media (prefers-reduced-motion: reduce)");
    expect(
      source("components/drape-room/drape-room-progress-button.tsx"),
    ).toContain("motion-reduce:transition-none");
  });
});
