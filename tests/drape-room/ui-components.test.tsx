import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DRAPE_ROOM_ONBOARDING_SLIDES,
  DrapeRoomOnboarding,
} from "@/components/drape-room/drape-room-onboarding";
import { DrapeRoomActionTile } from "@/components/drape-room/drape-room-action-tile";
import { DrapeRoomResultActions } from "@/components/drape-room/drape-room-result-actions";
import { DrapeRoomResultView } from "@/components/drape-room/drape-room-result-view";
import { DrapeRoomSetupView } from "@/components/drape-room/drape-room-setup-view";
import { DrapeRoomTrigger } from "@/components/drape-room/drape-room-trigger";
import { DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE } from "@/components/drape-room/drape-room-copy";
import {
  CLASSIC_NIVI_DRAPE,
  DRAPE_ROOM_BACKGROUNDS,
} from "@/components/drape-room/types";
import type { DrapeSaree } from "@/lib/drape-room/product";

const product: DrapeSaree = {
  productId: "saree-1",
  productSlug: "midnight-silk",
  productName: "Midnight Silk Saree",
  fabric: "Silk",
  pricePaise: 1_250_000,
  stockStatus: "available",
  displayImageUrl: "/media/midnight-silk.webp",
  productImageId: "media-1",
  productReferenceVersion: "pdp:hash:v1",
};

describe("Drape Room UI contracts", () => {
  it("uses two skippable intro slides before the real setup screen", () => {
    expect(DRAPE_ROOM_ONBOARDING_SLIDES.map(({ title }) => title)).toEqual([
      "Upload your photo",
      "Confirm your saree",
      "Set up your drape",
    ]);
    const html = renderToStaticMarkup(
      <DrapeRoomOnboarding
        product={product}
        subjectPhoto={null}
        onPhotoSelect={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(html).toContain(">Skip</button>");
    expect(html).toContain("Step 1 of 3");
    expect(html).toContain(product.productName);
    expect(html).not.toContain("AI preview frame");
    expect(html.match(/aria-hidden="true" inert=""/g)).toHaveLength(1);
  });

  it("offers only fixed Classic Nivi and five allowed backgrounds", () => {
    expect(CLASSIC_NIVI_DRAPE.id).toBe("nivi");
    expect(DRAPE_ROOM_BACKGROUNDS.map(({ id }) => id)).toEqual([
      "studio",
      "festival",
      "wedding",
      "party",
      "birthday",
    ]);
  });

  it("renders exactly four primary controls with no general regenerate action", () => {
    const html = renderToStaticMarkup(
      <DrapeRoomResultActions
        onSave={vi.fn()}
        onVisitProduct={vi.fn()}
        onWishlist={vi.fn()}
        onAddToCart={vi.fn()}
      />,
    );
    expect(html.match(/data-drape-primary-action=/g)).toHaveLength(4);
    expect(html.match(/data-drape-action-tile/g)).toHaveLength(4);
    expect(html).toContain('role="group"');
    expect(html).toContain(">Save image</span>");
    expect(html).toContain(">Visit product</span>");
    expect(html).toContain(">Wishlist</span>");
    expect(html).toContain(">Add to bag</span>");
    expect(html).not.toContain("data-drape-regenerate");
    expect(html).not.toContain("Regenerate preview");
    expect(html).not.toContain("Share");
    expect(html).toContain("auto-rows-fr");
    expect(html.match(/flex h-full min-w-0/g)).toHaveLength(4);
  });

  it("renders a 44px labelled dialog trigger without a link", () => {
    const html = renderToStaticMarkup(
      <DrapeRoomTrigger product={product} onOpen={vi.fn()} />,
    );
    expect(html).toContain("<button");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(
      'aria-label="Open Drape Room for Midnight Silk Saree"',
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("Drape Room");
    expect(html).toContain("bg-ftt-ivory");
    expect(html).toContain("text-ftt-navy");
    expect(html).toContain("hover:bg-ftt-navy");
    expect(html).toContain("hover:text-ftt-ivory");
    expect(html).not.toContain("<a");
  });

  it("keeps both generation calls behind explicit create or confirm handlers", () => {
    const stageSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-stage.tsx"),
      "utf8",
    );
    const generationSource = readFileSync(
      join(process.cwd(), "components/drape-room/use-drape-room-generation.ts"),
      "utf8",
    );
    const hostSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-portal-host.tsx"),
      "utf8",
    );
    const setupSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-setup-view.tsx"),
      "utf8",
    );
    expect(stageSource.match(/void onGenerate\(/g)).toHaveLength(2);
    expect(stageSource).toContain('onCreate={() => void onGenerate("studio")}');
    expect(stageSource).toContain("void onGenerate(background)");
    expect(stageSource).not.toContain("regenerate");
    expect(generationSource.match(/transport\.generate\(/g)).toHaveLength(1);
    expect(generationSource).toContain("consentToken,");
    expect(generationSource).toContain('if (code === "CONSENT_REQUIRED")');
    expect(generationSource.indexOf("setActiveRequestId(null)")).toBeLessThan(
      generationSource.indexOf("await onConsentRequired()"),
    );
    expect(generationSource.indexOf("if (!cacheLookupReady)")).toBeLessThan(
      generationSource.indexOf("transport.generate("),
    );
    expect(generationSource).toContain(
      "photo.readiness.policyVersion !== PHOTO_READINESS_POLICY_VERSION",
    );
    expect(
      generationSource.indexOf("photo.readiness?.state !== \"ready\""),
    ).toBeLessThan(generationSource.indexOf("transport.generate("));
    expect(setupSource).toContain("isCacheChecking");
    expect(setupSource).toContain("Checking saved previews…");
    expect(hostSource).toContain("ssr: false");
    expect(hostSource).toContain("(state) => state.isOpen");
    expect(hostSource).toContain("setActivated(true)");
    expect(hostSource).toContain("state.selectedSaree");
    expect(hostSource).not.toContain(".generate(");
    expect(hostSource).not.toContain("@mediapipe/tasks-vision");
    expect(hostSource).not.toContain("photo-readiness-mediapipe");
    expect(hostSource).toContain('import("./drape-room-commerce-shell")');
    expect(hostSource).not.toContain("drape-room-readiness-dialog");
    expect(hostSource).toContain("setUiAvailability(true)");
    expect(hostSource).toContain("availability={availability}");
    expect(hostSource).toContain("selectedSaree?.generationReady !== false");
    expect(hostSource).toContain("millisecondsUntilDrapeRoomConfigRefresh");
    expect(hostSource).toContain("window.setTimeout");
    expect(hostSource).not.toContain("state.close()");
    expect(hostSource).not.toContain("CommerceProviders");
  });

  it("isolates photo progress and exposes visible keyboard upload focus", () => {
    const experienceSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-experience.tsx"),
      "utf8",
    );
    const onboardingSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-onboarding.tsx"),
      "utf8",
    );
    const setupSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-setup-view.tsx"),
      "utf8",
    );
    const stageSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-stage.tsx"),
      "utf8",
    );
    const shellSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-dialog-shell.tsx"),
      "utf8",
    );
    const progressCallback = experienceSource.slice(
      experienceSource.indexOf("onProgress:"),
      experienceSource.indexOf("});", experienceSource.indexOf("onProgress:")),
    );

    expect(progressCallback).toContain("setDrapeRoomProgressMessage");
    expect(progressCallback).not.toContain("setStatusMessage");
    expect(onboardingSource).toContain("peer-focus-visible:ring-2");
    expect(onboardingSource).toContain("pointer-events-auto absolute");
    expect(onboardingSource).toContain("z-30");
    expect(onboardingSource).not.toContain("min-h-[31rem]");
    expect(setupSource).toContain("peer-focus-visible:ring-2");
    expect(setupSource).toContain("sticky bottom-0");
    expect(stageSource).toContain("<DrapeRoomDialogShell");
    expect(stageSource).toContain("DrapeRoomOnboardingProgress currentStep={3}");
    expect(shellSource).toContain("max-h-[calc(100dvh-1rem)]");
    expect(shellSource).toContain("w-[calc(100%-1rem)]");
    expect(shellSource).toContain("sm:max-w-[44rem]");
    expect(shellSource).toContain("lg:max-w-[54rem]");
    expect(shellSource).not.toContain("h-[96dvh]");
    expect(onboardingSource).toContain("@sm:pr-16");
    expect(experienceSource).toContain(
      'import("@/lib/drape-room/client/photo-readiness-mediapipe")',
    );
  });

  it("keeps the navbar replacement input mounted outside its popover portal", () => {
    const source = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-photo-menu.tsx"),
      "utf8",
    );
    expect(source.indexOf("ref={inputRef}")).toBeGreaterThan(-1);
    expect(source.indexOf("ref={inputRef}")).toBeLessThan(
      source.indexOf("<Popover>"),
    );
    expect(source).toContain("inputRef.current?.click()");
  });

  it("opens browser-local cached previews read-only when live generation is unavailable", () => {
    const menuSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-photo-menu.tsx"),
      "utf8",
    );
    const gallerySource = readFileSync(
      join(
        process.cwd(),
        "components/drape-room/drape-room-cached-gallery.tsx",
      ),
      "utf8",
    );
    const liveRoomBranch = menuSource.indexOf(
      "selectedSaree && drapeUiAvailable",
    );
    const cacheLookup = menuSource.indexOf("listRendersForPhoto");

    expect(liveRoomBranch).toBeGreaterThan(-1);
    expect(liveRoomBranch).toBeLessThan(cacheLookup);
    expect(menuSource).toContain("<DrapeRoomCachedGallery");
    expect(gallerySource).toContain("Browser-local · Read only");
    expect(gallerySource).toContain("This saved-preview view is read-only.");
    expect(gallerySource).toContain("Save image");
    expect(gallerySource).toContain("Visit product");
    expect(gallerySource).not.toContain("Regenerate");
    expect(gallerySource).not.toContain("onGenerate");
    expect(gallerySource).not.toContain("transport");
    expect(gallerySource).not.toContain("fetch(");
  });

  it("keeps the mobile result track and all four actions shrinkable", () => {
    const resultSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-result-view.tsx"),
      "utf8",
    );
    const actionsSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-result-actions.tsx"),
      "utf8",
    );
    expect(resultSource).toContain("grid w-full min-w-0 max-w-[54rem]");
    expect(resultSource).toContain("flex min-w-0 max-w-full flex-col");
    expect(actionsSource).toContain(
      "grid w-full min-w-0 max-w-full auto-rows-fr grid-cols-2",
    );
    expect(actionsSource).toContain("auto-rows-fr");
    expect(actionsSource.match(/flex h-full min-w-0/g)).toHaveLength(4);
  });

  it("does not replace the previous render in the generation failure path", () => {
    const source = readFileSync(
      join(process.cwd(), "components/drape-room/use-drape-room-generation.ts"),
      "utf8",
    );
    const catchBlock = source.slice(
      source.indexOf("} catch (error) {", source.indexOf("const generate")),
      source.indexOf("} finally {", source.indexOf("const generate")),
    );
    expect(catchBlock).not.toContain("setResults(");
    expect(catchBlock).not.toContain("deleteRender(");
    expect(source).toContain("Existing results remain untouched");
  });

  it("keeps the full setup visible and fail-closed without provider config", () => {
    const setupSource = readFileSync(
      join(process.cwd(), "components/drape-room/drape-room-setup-view.tsx"),
      "utf8",
    );
    const html = renderToStaticMarkup(
      <DrapeRoomSetupView
        product={product}
        config={null}
        configStatus="unavailable"
        generationAvailable={false}
        subjectPhoto={{
          digest: "a".repeat(64),
          previewUrl: "blob:subject",
          width: 900,
          height: 1_200,
          byteSize: 1_024,
        }}
        consentAccepted={false}
        isGenerating={false}
        isPhotoBusy={false}
        isCacheChecking={false}
        storageMode="indexeddb"
        uploadId="photo-upload"
        consentId="photo-consent"
        photoSelectedThisVisit={false}
        onPhotoSelect={vi.fn()}
        onAskReplace={vi.fn()}
        onConsentChange={vi.fn()}
        onCreate={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(html).toContain(product.productName);
    expect(html).toContain("Classic Nivi");
    expect(html).toContain("Studio");
    expect(html).toContain(DRAPE_ROOM_GENERATION_UNAVAILABLE_MESSAGE);
    expect(html).toContain("Provider configuration is not currently available.");
    expect(setupSource).toContain("data-[state=checked]:text-ftt-ivory");
    expect(setupSource).toContain("[&_svg]:text-ftt-ivory");
    expect(html).not.toContain("Google Gemini");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Create my drape<\/button>/);
  });

  it("keeps cached result actions and backgrounds usable while paid actions are disabled", () => {
    const html = renderToStaticMarkup(
      <DrapeRoomResultView
        product={product}
        result={{
          cacheKey: `tryon:${"b".repeat(64)}`,
          blob: new Blob(["cached"], { type: "image/jpeg" }),
          previewUrl: "blob:cached-result",
          userPhotoDigest: "a".repeat(64),
          productId: product.productId,
          productReferenceVersion: product.productReferenceVersion,
          referenceContractVersion: "gallery-v2",
          background: "studio",
          provider: "google",
          model: "image-model-v1",
          promptVersion: "prompt-v1",
          engineVersion: "engine-v1",
          outputVersion: "output-v1",
          createdAt: 2,
        }}
        activeBackground="studio"
        cachedBackgrounds={new Set(["studio", "festival"])}
        generationAvailable={false}
        remainingGenerations={0}
        generationBlockedReason="You have used today’s three previews for this saree. Your saved images remain available, and you can create more after midnight."
        wishlistControl={
          <DrapeRoomActionTile icon={<span aria-hidden="true">W</span>} label="Wishlist" />
        }
        addToCartControl={
          <DrapeRoomActionTile icon={<span aria-hidden="true">B</span>} label="Add to bag" />
        }
        isGenerating={false}
        isCacheChecking={false}
        onBackgroundSelect={vi.fn()}
        onSave={vi.fn()}
        onVisit={vi.fn()}
      />,
    );

    const backgroundTag = (background: string) =>
      html.match(
        new RegExp(`<button[^>]*data-drape-background="${background}"[^>]*>`),
      )?.[0] ?? "";
    expect(html.match(/data-drape-primary-action=/g)).toHaveLength(4);
    expect(html).toContain("used today’s three previews for this saree");
    expect(html).toContain(
      "Daily limit reached. Saved backgrounds remain free to view.",
    );
    expect(html).toContain("Saved · Opens free");
    expect(html).toContain("Create · Daily limit reached");
    expect(backgroundTag("festival")).not.toContain(' disabled=""');
    expect(backgroundTag("wedding")).toContain(' disabled=""');
    expect(html).not.toContain("data-drape-regenerate");
    const actionTiles = html.match(/<button[^>]*data-drape-action-tile[^>]*>/g) ?? [];
    expect(actionTiles).toHaveLength(4);
    expect(actionTiles.every((tag) => !tag.includes('disabled=""'))).toBe(true);
  });

  it("marks cached backgrounds as free and uncached backgrounds as one generation", () => {
    const html = renderToStaticMarkup(
      <DrapeRoomResultView
        product={product}
        result={{
          cacheKey: `tryon:${"b".repeat(64)}`,
          blob: new Blob(["cached"], { type: "image/jpeg" }),
          previewUrl: "blob:cached-result",
          userPhotoDigest: "a".repeat(64),
          productId: product.productId,
          productReferenceVersion: product.productReferenceVersion,
          referenceContractVersion: "gallery-v2",
          background: "studio",
          provider: "google",
          model: "image-model-v1",
          promptVersion: "prompt-v1",
          engineVersion: "engine-v1",
          outputVersion: "output-v1",
          createdAt: 2,
        }}
        activeBackground="studio"
        cachedBackgrounds={new Set(["studio", "festival"])}
        generationAvailable
        remainingGenerations={2}
        isGenerating={false}
        isCacheChecking={false}
        onBackgroundSelect={vi.fn()}
        onSave={vi.fn()}
        onVisit={vi.fn()}
      />,
    );

    expect(html).toContain("Saved backgrounds open instantly and use no AI generation.");
    expect(html).toContain("2 generations left today.");
    expect(html).toContain("Current · Saved");
    expect(html).toContain("Saved · Opens free");
    expect(html.match(/Create · Uses 1 generation/g)).toHaveLength(3);
  });

  it("defers the welcome popup while Drape Room owns the modal layer", () => {
    const source = readFileSync(
      join(process.cwd(), "components/widgets/site-widgets.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "const drapeRoomPresentationOpen = useDrapeRoomOperationalStore(",
    );
    expect(source).toContain("(state) => state.isOpen");
    expect(source).toContain(
      "widgetsReady && !drapeRoomPresentationOpen ? <WelcomePopup /> : null",
    );
  });
});
