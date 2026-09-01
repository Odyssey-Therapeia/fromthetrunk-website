import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  DrapeRoomClientStorage,
  MAX_CACHED_RENDER_BYTES,
  MAX_CACHED_RENDERS,
  ONBOARDING_STORAGE_KEY,
  USER_PHOTO_KEY,
  clearDrapeRoomConsent,
  closeDrapeRoomStorageNotifications,
  completeDrapeRoomOnboarding,
  createRenderCacheKey,
  getDrapeRoomConsent,
  getDrapeRoomOnboarding,
  hasCurrentDrapeRoomConsent,
  setDrapeRoomConsent,
  subscribeToDrapeRoomStorageChanges,
  type SaveDrapeRenderInput,
} from "@/lib/drape-room/client/storage";

const PHOTO_DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);
const PHOTO_READY = {
  state: "ready" as const,
  policyVersion: "face-visible-v1",
  checkedAt: 1_700_000_000_000,
};
const CONSENT = {
  provider: "google" as const,
  disclosureVersion: "disclosure-v1",
  privacyPolicyVersion: "privacy-v1",
};

function jpegBlob(bytes = 16): Blob {
  const value = new Uint8Array(Math.max(3, bytes));
  value.set([0xff, 0xd8, 0xff]);
  return new Blob([value], { type: "image/jpeg" });
}

function renderKey(index: number): string {
  return `tryon:${index.toString(16).padStart(64, "0")}`;
}

function renderInput(
  index: number,
  overrides: Partial<SaveDrapeRenderInput> = {},
): SaveDrapeRenderInput {
  return {
    cacheKey: renderKey(index),
    blob: jpegBlob(32),
    width: 768,
    height: 1_024,
    userPhotoDigest: PHOTO_DIGEST,
    productId: `product-${index}`,
    productSlug: `product-${index}`,
    productName: `Product ${index}`,
    productReferenceVersion: `pdp:hash-${index}:v1`,
    background: "studio",
    provider: "google",
    model: "gemini-3.1-flash-image",
    promptVersion: "nivi-v3",
    engineVersion: "engine-v1",
    outputVersion: "jpeg-v1",
    ...overrides,
  };
}

type PersistentDeleteCase = {
  name: string;
  seed: (storage: DrapeRoomClientStorage) => Promise<void>;
  remove: (storage: DrapeRoomClientStorage) => Promise<void>;
  remains: (storage: DrapeRoomClientStorage) => Promise<boolean>;
};

const persistentDeleteCases: PersistentDeleteCase[] = [
  {
    name: "user photo",
    seed: async (candidate) => {
      await candidate.saveUserPhoto({
        blob: jpegBlob(),
        width: 960,
        height: 1_280,
        digest: PHOTO_DIGEST,
        readiness: PHOTO_READY,
      });
    },
    remove: (candidate) => candidate.deleteUserPhoto(),
    remains: async (candidate) => (await candidate.getUserPhoto()) !== null,
  },
  {
    name: "renders for a photo",
    seed: async (candidate) => {
      await candidate.saveRender(renderInput(1));
    },
    remove: (candidate) => candidate.deleteRendersForPhoto(PHOTO_DIGEST),
    remains: async (candidate) =>
      (await candidate.getRender(renderKey(1))) !== null,
  },
  {
    name: "single render",
    seed: async (candidate) => {
      await candidate.saveRender(renderInput(1));
    },
    remove: (candidate) => candidate.deleteRender(renderKey(1)),
    remains: async (candidate) =>
      (await candidate.getRender(renderKey(1))) !== null,
  },
  {
    name: "metadata",
    seed: async (candidate) => {
      await candidate.setMetadata("current-background", "festival");
    },
    remove: (candidate) => candidate.deleteMetadata("current-background"),
    remains: async (candidate) =>
      (await candidate.getMetadata("current-background")) !== null,
  },
];

function memoryLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Drape Room browser storage", () => {
  let now: number;
  let storage: DrapeRoomClientStorage;

  beforeEach(async () => {
    now = 1_000;
    storage = new DrapeRoomClientStorage({ forceMemory: true, now: () => now++ });
    await storage.clearAllData();
  });

  afterEach(async () => {
    await storage.clearAllData();
    storage.dispose();
    closeDrapeRoomStorageNotifications();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores the processed JPEG Blob under the exact user_photo key", async () => {
    const saved = await storage.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });

    expect(saved).toMatchObject({
      key: USER_PHOTO_KEY,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
      mimeType: "image/jpeg",
      width: 960,
      height: 1_280,
    });
    expect(saved.blob).toBeInstanceOf(Blob);
    expect(await storage.getUserPhoto()).toMatchObject({ key: USER_PHOTO_KEY });
  });

  it("keeps eight LRU renders and never evicts the photo", async () => {
    await storage.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });
    for (let index = 1; index <= MAX_CACHED_RENDERS; index += 1) {
      await storage.saveRender(renderInput(index));
    }
    await storage.getRender(renderKey(1));
    await storage.saveRender(renderInput(9, { background: "festival" }));

    expect(await storage.getRender(renderKey(1))).not.toBeNull();
    expect(await storage.getRender(renderKey(2))).toBeNull();
    expect(await storage.getUserPhoto()).not.toBeNull();
    expect(await storage.getRenderStats()).toMatchObject({
      count: MAX_CACHED_RENDERS,
      maximumBytes: MAX_CACHED_RENDER_BYTES,
      maximumCount: MAX_CACHED_RENDERS,
    });
  });

  it("lists cloned current-photo renders from memory in most-recent order", async () => {
    await storage.saveRender(renderInput(1));
    await storage.saveRender(renderInput(2));
    await storage.saveRender(
      renderInput(3, { userPhotoDigest: OTHER_DIGEST }),
    );
    await storage.getRender(renderKey(1));

    const listed = await storage.listRendersForPhoto(PHOTO_DIGEST);
    expect(listed.map(({ cacheKey }) => cacheKey)).toEqual([
      renderKey(1),
      renderKey(2),
    ]);
    listed[0]!.productName = "Mutated outside storage";
    expect((await storage.listRendersForPhoto(PHOTO_DIGEST))[0]?.productName).toBe(
      "Product 1",
    );
  });

  it("lists validated current-photo renders from a fresh IndexedDB reader", async () => {
    const writer = new DrapeRoomClientStorage({ now: () => now++ });
    await writer.clearAllData();
    await writer.saveRender(renderInput(1));
    await writer.saveRender(renderInput(2));
    await writer.saveRender(
      renderInput(3, { userPhotoDigest: OTHER_DIGEST }),
    );
    writer.dispose();

    const reader = new DrapeRoomClientStorage({ now: () => now++ });
    const listed = await reader.listRendersForPhoto(PHOTO_DIGEST);
    expect(listed.map(({ cacheKey }) => cacheKey)).toEqual([
      renderKey(2),
      renderKey(1),
    ]);
    expect(listed.every(({ userPhotoDigest }) => userPhotoDigest === PHOTO_DIGEST)).toBe(
      true,
    );
    await reader.clearAllData();
    reader.dispose();
  });

  it("enforces the forty-megabyte render budget independently of count", async () => {
    for (let index = 1; index <= 5; index += 1) {
      await storage.saveRender(
        renderInput(index, { blob: jpegBlob(9 * 1024 * 1024) }),
      );
    }
    expect(await storage.getRender(renderKey(1))).toBeNull();
    expect((await storage.getRenderStats()).bytes).toBeLessThanOrEqual(
      MAX_CACHED_RENDER_BYTES,
    );
  });

  it("replacing a photo removes only renders tied to the previous digest", async () => {
    await storage.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });
    await storage.saveRender(renderInput(1));
    await storage.saveRender(
      renderInput(2, { userPhotoDigest: OTHER_DIGEST }),
    );

    await storage.replaceUserPhoto({
      blob: jpegBlob(),
      width: 900,
      height: 1_200,
      digest: OTHER_DIGEST,
      readiness: PHOTO_READY,
    });

    expect(await storage.getRender(renderKey(1))).toBeNull();
    expect(await storage.getRender(renderKey(2))).not.toBeNull();
    expect((await storage.getUserPhoto())?.digest).toBe(OTHER_DIGEST);
  });

  it("preserves the committed photo and renders when atomic replacement fails", async () => {
    const indexed = new DrapeRoomClientStorage({ now: () => now++ });
    await indexed.clearAllData();
    await indexed.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });
    await indexed.saveRender(renderInput(1));

    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });
    await expect(
      indexed.replaceUserPhoto({
        blob: jpegBlob(),
        width: 900,
        height: 1_200,
        digest: OTHER_DIGEST,
        readiness: PHOTO_READY,
      }),
    ).rejects.toThrow("current photo was kept");
    put.mockRestore();

    expect((await indexed.getUserPhoto())?.digest).toBe(PHOTO_DIGEST);
    expect(await indexed.getRender(renderKey(1))).not.toBeNull();
    indexed.dispose();
  });

  it("does not lose the current-tab photo after an IndexedDB write failure", async () => {
    const indexed = new DrapeRoomClientStorage({ now: () => now++ });
    await indexed.clearAllData();
    await indexed.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

    const fallback = await indexed.saveUserPhoto({
      blob: jpegBlob(),
      width: 900,
      height: 1_200,
      digest: OTHER_DIGEST,
      readiness: PHOTO_READY,
    });
    put.mockRestore();

    expect(fallback.digest).toBe(OTHER_DIGEST);
    expect((await indexed.getUserPhoto())?.digest).toBe(OTHER_DIGEST);
    expect(await indexed.mode()).toBe("memory");
    await expect(indexed.clearAllData()).rejects.toThrow(
      "could not be removed from browser storage",
    );
    expect((await indexed.getUserPhoto())?.digest).toBe(OTHER_DIGEST);
    indexed.dispose();

    const cleanup = new DrapeRoomClientStorage({ now: () => now++ });
    await cleanup.clearAllData();
    cleanup.dispose();
  });

  it("throws instead of claiming persisted data was cleared after an IndexedDB failure", async () => {
    const indexed = new DrapeRoomClientStorage({ now: () => now++ });
    await indexed.clearAllData();
    await indexed.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });

    const clear = vi
      .spyOn(IDBObjectStore.prototype, "clear")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "InvalidStateError");
      });
    await expect(indexed.clearAllData()).rejects.toThrow(
      "could not be removed from browser storage",
    );
    clear.mockRestore();

    expect((await indexed.getUserPhoto())?.digest).toBe(PHOTO_DIGEST);
    const reloaded = new DrapeRoomClientStorage({ now: () => now++ });
    expect((await reloaded.getUserPhoto())?.digest).toBe(PHOTO_DIGEST);
    await reloaded.clearAllData();
    reloaded.dispose();
    indexed.dispose();
  });

  it.each(persistentDeleteCases)(
    "throws instead of claiming the persisted $name was deleted",
    async ({ seed, remove, remains }) => {
      const indexed = new DrapeRoomClientStorage({ now: () => now++ });
      await indexed.clearAllData();
      await seed(indexed);

      const removeFromIndexedDb = vi
        .spyOn(IDBObjectStore.prototype, "delete")
        .mockImplementation(() => {
          throw new DOMException("Storage blocked", "InvalidStateError");
        });
      await expect(remove(indexed)).rejects.toThrow(
        "could not be removed from browser storage",
      );
      removeFromIndexedDb.mockRestore();

      expect(await remains(indexed)).toBe(true);
      const reloaded = new DrapeRoomClientStorage({ now: () => now++ });
      expect(await remains(reloaded)).toBe(true);
      await reloaded.clearAllData();
      reloaded.dispose();
      indexed.dispose();
    },
  );

  it("throws instead of claiming persisted renders were cleared", async () => {
    const indexed = new DrapeRoomClientStorage({ now: () => now++ });
    await indexed.clearAllData();
    await indexed.saveRender(renderInput(1));

    const clearFromIndexedDb = vi
      .spyOn(IDBObjectStore.prototype, "clear")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "InvalidStateError");
      });
    await expect(indexed.clearRenders()).rejects.toThrow(
      "could not be removed from browser storage",
    );
    clearFromIndexedDb.mockRestore();

    expect(await indexed.getRender(renderKey(1))).not.toBeNull();
    const reloaded = new DrapeRoomClientStorage({ now: () => now++ });
    expect(await reloaded.getRender(renderKey(1))).not.toBeNull();
    await reloaded.clearAllData();
    reloaded.dispose();
    indexed.dispose();
  });

  it("supports every destructive operation in deliberate memory mode", async () => {
    await storage.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });
    await storage.saveRender(renderInput(1));
    await storage.deleteRendersForPhoto(PHOTO_DIGEST);
    expect(await storage.getRender(renderKey(1))).toBeNull();

    await storage.saveRender(renderInput(2));
    await storage.deleteRender(renderKey(2));
    expect(await storage.getRender(renderKey(2))).toBeNull();

    await storage.saveRender(renderInput(3));
    await storage.clearRenders();
    expect((await storage.getRenderStats()).count).toBe(0);

    await storage.setMetadata("current-background", "festival");
    await storage.deleteMetadata("current-background");
    expect(await storage.getMetadata("current-background")).toBeNull();

    await storage.deleteUserPhoto();
    expect(await storage.getUserPhoto()).toBeNull();
    await storage.clearAllData();
  });

  it("builds a deterministic key and invalidates every identity field", async () => {
    const base = {
      userPhotoDigest: PHOTO_DIGEST,
      productId: "product-1",
      productReferenceVersion: "pdp:asset-v3:v1",
      background: "wedding" as const,
      provider: "google",
      model: "gemini-3.1-flash-image",
      promptVersion: "nivi-v3",
      engineVersion: "engine-v1",
      outputVersion: "jpeg-v1",
    };
    const first = await createRenderCacheKey(base);
    expect(first).toMatch(/^tryon:[a-f0-9]{64}$/);
    expect(await createRenderCacheKey(base)).toBe(first);

    const changes = [
      { userPhotoDigest: OTHER_DIGEST },
      { productId: "product-2" },
      { productReferenceVersion: "pdp:asset-v4:v1" },
      { background: "party" as const },
      { provider: "openai" },
      { model: "gpt-image-2" },
      { promptVersion: "nivi-v4" },
      { engineVersion: "engine-v2" },
      { outputVersion: "jpeg-v2" },
    ];
    for (const change of changes) {
      expect(await createRenderCacheKey({ ...base, ...change })).not.toBe(first);
    }
  });

  it("notifies same-tab subscribers without image bytes", async () => {
    const changes: unknown[] = [];
    const unsubscribe = subscribeToDrapeRoomStorageChanges((change) =>
      changes.push(change),
    );
    await storage.saveUserPhoto({
      blob: jpegBlob(),
      width: 960,
      height: 1_280,
      digest: PHOTO_DIGEST,
      readiness: PHOTO_READY,
    });
    expect(changes).toEqual([
      expect.objectContaining({ type: "user-photo-updated", key: USER_PHOTO_KEY }),
    ]);
    expect(JSON.stringify(changes)).not.toContain("data:image");
    unsubscribe();
  });

  it("uses only the exact consent/onboarding localStorage keys", () => {
    const localStorage = memoryLocalStorage();
    vi.stubGlobal("window", { localStorage });
    setDrapeRoomConsent(true, CONSENT, 2_000);
    completeDrapeRoomOnboarding(2_001);

    expect(hasCurrentDrapeRoomConsent(CONSENT)).toBe(true);
    expect(getDrapeRoomConsent()).toEqual({
      accepted: true,
      ...CONSENT,
      decidedAt: 2_000,
    });
    expect(getDrapeRoomOnboarding()).toEqual({ completed: true, completedAt: 2_001 });
    expect([localStorage.key(0), localStorage.key(1)].sort()).toEqual(
      [CONSENT_STORAGE_KEY, ONBOARDING_STORAGE_KEY].sort(),
    );

    expect(
      hasCurrentDrapeRoomConsent({ ...CONSENT, provider: "openai" }),
    ).toBe(false);
    expect(
      hasCurrentDrapeRoomConsent({ ...CONSENT, disclosureVersion: "v2" }),
    ).toBe(false);
    expect(
      hasCurrentDrapeRoomConsent({ ...CONSENT, privacyPolicyVersion: "v2" }),
    ).toBe(false);
    clearDrapeRoomConsent();
    expect(getDrapeRoomConsent()).toBeNull();
  });

  it("keeps current-tab consent valid when localStorage writes are blocked", () => {
    const localStorage = memoryLocalStorage();
    localStorage.setItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
    vi.stubGlobal("window", { localStorage });

    setDrapeRoomConsent(true, CONSENT, 3_000);
    expect(hasCurrentDrapeRoomConsent(CONSENT)).toBe(true);
    clearDrapeRoomConsent();
    expect(hasCurrentDrapeRoomConsent(CONSENT)).toBe(false);
  });
});
