import { beforeEach, describe, expect, it } from "vitest";
import { useDrapeRoomOperationalStore } from "@/lib/drape-room/client/store";
import type { DrapeSaree } from "@/lib/drape-room/product";

const saree: DrapeSaree = {
  productId: "product-1",
  productSlug: "midnight-silk",
  productName: "Midnight Silk Saree",
  fabric: "Silk",
  pricePaise: 1_250_000,
  stockStatus: "available",
  displayImageUrl: "/media/midnight.webp",
  productImageId: "media-1",
  productReferenceVersion: "pdp:hash:v1",
};

describe("Drape Room operational store", () => {
  beforeEach(() => {
    useDrapeRoomOperationalStore.setState({
      isOpen: false,
      drapeUiAvailable: false,
      configHydrated: false,
      selectedSaree: null,
      background: "studio",
      phase: "idle",
      storageMode: "checking",
      activeRequestId: null,
      errorCode: null,
      photoRevision: 0,
    });
  });

  it("keeps UI availability independent from paid generation readiness", () => {
    const actions = useDrapeRoomOperationalStore.getState();
    actions.setUiAvailability(true);
    actions.open({ ...saree, generationReady: false });

    expect(useDrapeRoomOperationalStore.getState()).toMatchObject({
      drapeUiAvailable: true,
      isOpen: true,
      selectedSaree: expect.objectContaining({
        productId: saree.productId,
        generationReady: false,
      }),
    });
  });

  it("keeps product and request ownership when the visual dialog closes", () => {
    const actions = useDrapeRoomOperationalStore.getState();
    actions.open(saree);
    actions.setBackground("birthday");
    actions.setPhase("generating");
    actions.setActiveRequestId("request-1");
    actions.close();

    expect(useDrapeRoomOperationalStore.getState()).toMatchObject({
      isOpen: false,
      selectedSaree: saree,
      background: "birthday",
      phase: "generating",
      activeRequestId: "request-1",
    });
    useDrapeRoomOperationalStore.getState().reopen();
    expect(useDrapeRoomOperationalStore.getState().isOpen).toBe(true);
  });

  it("does not switch products while a request is active", () => {
    useDrapeRoomOperationalStore.getState().open(saree);
    useDrapeRoomOperationalStore.getState().setActiveRequestId("request-1");
    useDrapeRoomOperationalStore.getState().open({
      ...saree,
      productId: "product-2",
      productSlug: "second",
    });
    expect(useDrapeRoomOperationalStore.getState().selectedSaree?.productId).toBe(
      "product-1",
    );
  });

  it("stores only operational metadata and no image payload fields", () => {
    useDrapeRoomOperationalStore.getState().open(saree);
    useDrapeRoomOperationalStore.getState().fail("PROVIDER_TIMEOUT");
    const state = useDrapeRoomOperationalStore.getState();
    expect(state).toMatchObject({ phase: "error", errorCode: "PROVIDER_TIMEOUT" });
    expect(Object.keys(state)).not.toEqual(
      expect.arrayContaining([
        "blob",
        "image",
        "imageData",
        "dataUrl",
        "objectUrl",
        "render",
      ]),
    );
  });
});
