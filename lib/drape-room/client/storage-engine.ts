"use client";

// Single IndexedDB/memory implementation. Public imports use ./storage.

import {
  notifyDrapeRoomStorageChange as notifyStorageChange,
} from "./storage-events";
import {
  DrapeRoomStorageBackend,
  MonotonicStorageClock,
} from "./storage-backend";
import {
  assertRenderCacheKey,
  assertRenderInput,
  assertUserPhotoInput,
  cloneMetadataValue,
  cloneRender,
  cloneUserPhoto,
  createRenderRecord,
  createUserPhotoRecord,
  isStoredRender,
  isStoredUserPhoto,
  normalizeMetadataKey,
  normalizeSha256,
  pruneIndexedDbRenders,
  pruneMemoryRenders,
  renderStats,
} from "./storage-policy";
import {
  readIndexedDbRendersForPhoto,
  readMemoryRendersForPhoto,
} from "./storage-render-query";
import {
  USER_PHOTO_KEY,
  type DrapeRoomMetadataValue,
  type DrapeRoomRenderStats,
  type DrapeRoomStorageMode,
  type SaveDrapeRenderInput,
  type SaveUserPhotoInput,
  type StoredPhotoReadiness,
  type StoredDrapeRender,
  type StoredMetadata,
  type StoredUserPhoto,
} from "./storage-schema";

export class DrapeRoomClientStorage {
  readonly #backend: DrapeRoomStorageBackend;
  readonly #clock: MonotonicStorageClock;
  #memoryPhoto: StoredUserPhoto | null = null;
  #memoryRenders = new Map<string, StoredDrapeRender>();
  #memoryMetadata = new Map<string, StoredMetadata>();

  constructor(options: { forceMemory?: boolean; now?: () => number } = {}) {
    this.#backend = new DrapeRoomStorageBackend(options.forceMemory === true);
    this.#clock = new MonotonicStorageClock(options.now ?? Date.now);
  }

  async mode(): Promise<DrapeRoomStorageMode> {
    return (await this.#backend.database()) === null ? "memory" : "indexeddb";
  }

  async saveUserPhoto(input: SaveUserPhotoInput): Promise<StoredUserPhoto> {
    assertUserPhotoInput(input);
    const now = this.#clock.next();
    const database = await this.#backend.database();

    if (database) {
      try {
        const transaction = database.transaction("photos", "readwrite");
        const existing = await transaction.store.get(USER_PHOTO_KEY);
        const record = createUserPhotoRecord(
          input,
          now,
          isStoredUserPhoto(existing) ? existing.createdAt : now,
        );
        await transaction.store.put(record);
        await transaction.done;
        this.#memoryPhoto = record;
        notifyStorageChange("user-photo-updated", USER_PHOTO_KEY);
        return cloneUserPhoto(record);
      } catch {
        this.#backend.disable(database);
      }
    }

    const record = createUserPhotoRecord(
      input,
      now,
      this.#memoryPhoto?.createdAt ?? now,
    );
    this.#memoryPhoto = record;
    notifyStorageChange("user-photo-updated", USER_PHOTO_KEY);
    return cloneUserPhoto(record);
  }

  /** Replaces the one browser-owned photo and invalidates only its old renders. */
  async replaceUserPhoto(input: SaveUserPhotoInput): Promise<StoredUserPhoto> {
    assertUserPhotoInput(input);
    const now = this.#clock.next();
    const database = await this.#backend.database();

    if (database) {
      try {
        const transaction = database.transaction(
          ["photos", "renders"],
          "readwrite",
        );
        const photos = transaction.objectStore("photos");
        const renders = transaction.objectStore("renders");
        const existingValue = await photos.get(USER_PHOTO_KEY);
        const existing = isStoredUserPhoto(existingValue)
          ? existingValue
          : null;
        const oldRenders = existing
          ? (await renders.index("userPhotoDigest").getAll(existing.digest)).filter(
              isStoredRender,
            )
          : [];

        // Mirror the committed pre-transaction state before any fallible write.
        if (existing) this.#memoryPhoto = existing;
        oldRenders.forEach((render) =>
          this.#memoryRenders.set(render.cacheKey, render),
        );

        const record = createUserPhotoRecord(
          input,
          now,
          existing?.createdAt ?? now,
        );
        await photos.put(record);
        if (existing && existing.digest !== record.digest) {
          const keys = await renders
            .index("userPhotoDigest")
            .getAllKeys(existing.digest);
          await Promise.all(keys.map((key) => renders.delete(key)));
        }
        await transaction.done;

        this.#memoryPhoto = record;
        if (existing && existing.digest !== record.digest) {
          for (const [key, render] of this.#memoryRenders) {
            if (render.userPhotoDigest === existing.digest) {
              this.#memoryRenders.delete(key);
            }
          }
          notifyStorageChange("renders-cleared");
        }
        notifyStorageChange("user-photo-updated", USER_PHOTO_KEY);
        return cloneUserPhoto(record);
      } catch {
        this.#backend.disable(database);
        throw new Error(
          "Your current photo was kept because browser storage could not complete the replacement.",
        );
      }
    }

    const previous = this.#memoryPhoto;
    const record = createUserPhotoRecord(
      input,
      now,
      previous?.createdAt ?? now,
    );
    this.#memoryPhoto = record;
    if (previous && previous.digest !== record.digest) {
      for (const [key, render] of this.#memoryRenders) {
        if (render.userPhotoDigest === previous.digest) {
          this.#memoryRenders.delete(key);
        }
      }
      notifyStorageChange("renders-cleared");
    }
    notifyStorageChange("user-photo-updated", USER_PHOTO_KEY);
    return cloneUserPhoto(record);
  }

  async getUserPhoto(): Promise<StoredUserPhoto | null> {
    const database = await this.#backend.database();
    if (database) {
      try {
        const record = await database.get("photos", USER_PHOTO_KEY);
        if (record === undefined) return null;
        if (!isStoredUserPhoto(record)) {
          await database.delete("photos", USER_PHOTO_KEY);
          return null;
        }
        this.#memoryPhoto = record;
        return cloneUserPhoto(record);
      } catch {
        this.#backend.disable(database);
      }
    }
    return this.#memoryPhoto ? cloneUserPhoto(this.#memoryPhoto) : null;
  }

  /** Attaches a local-only readiness result only if the checked photo is still current. */
  async updateUserPhotoReadiness(
    userPhotoDigest: string,
    readiness: StoredPhotoReadiness,
  ): Promise<StoredUserPhoto | null> {
    const digest = normalizeSha256(userPhotoDigest);
    const now = this.#clock.next();
    const database = await this.#backend.database();
    if (database) {
      try {
        const transaction = database.transaction("photos", "readwrite");
        const current = await transaction.store.get(USER_PHOTO_KEY);
        if (!isStoredUserPhoto(current) || current.digest !== digest) {
          await transaction.done;
          return null;
        }
        const next: StoredUserPhoto = {
          ...current,
          readiness: { ...readiness },
          updatedAt: now,
        };
        await transaction.store.put(next);
        await transaction.done;
        this.#memoryPhoto = next;
        notifyStorageChange("user-photo-updated", USER_PHOTO_KEY);
        return cloneUserPhoto(next);
      } catch {
        this.#backend.disable(database);
      }
    }
    if (!this.#memoryPhoto || this.#memoryPhoto.digest !== digest) return null;
    this.#memoryPhoto = {
      ...this.#memoryPhoto,
      readiness: { ...readiness },
      updatedAt: now,
    };
    notifyStorageChange("user-photo-updated", USER_PHOTO_KEY);
    return cloneUserPhoto(this.#memoryPhoto);
  }

  async deleteUserPhoto(): Promise<void> {
    const database = await this.#backend.database();
    if (database) {
      try {
        await database.delete("photos", USER_PHOTO_KEY);
        this.#memoryPhoto = null;
        notifyStorageChange("user-photo-deleted", USER_PHOTO_KEY);
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#backend.assertPersistentDeletionComplete();
    this.#memoryPhoto = null;
    notifyStorageChange("user-photo-deleted", USER_PHOTO_KEY);
  }

  async deleteRendersForPhoto(userPhotoDigest: string): Promise<void> {
    const digest = normalizeSha256(userPhotoDigest);
    const database = await this.#backend.database();
    if (database) {
      try {
        const transaction = database.transaction("renders", "readwrite");
        const keys = await transaction.store
          .index("userPhotoDigest")
          .getAllKeys(digest);
        await Promise.all(keys.map((key) => transaction.store.delete(key)));
        await transaction.done;
        for (const [key, render] of this.#memoryRenders) {
          if (render.userPhotoDigest === digest) this.#memoryRenders.delete(key);
        }
        if (keys.length > 0) notifyStorageChange("renders-cleared");
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#backend.assertPersistentDeletionComplete();
    let removed = false;
    for (const [key, render] of this.#memoryRenders) {
      if (render.userPhotoDigest === digest) {
        this.#memoryRenders.delete(key);
        removed = true;
      }
    }
    if (removed) notifyStorageChange("renders-cleared");
  }

  async saveRender(input: SaveDrapeRenderInput): Promise<StoredDrapeRender> {
    assertRenderInput(input);
    const now = this.#clock.next();
    const database = await this.#backend.database();

    if (database) {
      try {
        const transaction = database.transaction("renders", "readwrite");
        const existing = await transaction.store.get(input.cacheKey);
        const record = createRenderRecord(
          input,
          now,
          isStoredRender(existing) ? existing.createdAt : now,
        );
        await transaction.store.put(record);
        const evicted = await pruneIndexedDbRenders(transaction.store);
        await transaction.done;
        this.#memoryRenders.set(record.cacheKey, record);
        evicted.forEach((key) => this.#memoryRenders.delete(key));
        pruneMemoryRenders(this.#memoryRenders);
        notifyStorageChange("render-updated", record.cacheKey);
        if (evicted.length > 0) notifyStorageChange("renders-pruned");
        return cloneRender(record);
      } catch {
        this.#backend.disable(database);
      }
    }

    const record = createRenderRecord(
      input,
      now,
      this.#memoryRenders.get(input.cacheKey)?.createdAt ?? now,
    );
    this.#memoryRenders.set(record.cacheKey, record);
    const evicted = pruneMemoryRenders(this.#memoryRenders);
    notifyStorageChange("render-updated", record.cacheKey);
    if (evicted.length > 0) notifyStorageChange("renders-pruned");
    return cloneRender(record);
  }

  async getRender(cacheKey: string): Promise<StoredDrapeRender | null> {
    assertRenderCacheKey(cacheKey);
    const now = this.#clock.next();
    const database = await this.#backend.database();

    if (database) {
      try {
        const transaction = database.transaction("renders", "readwrite");
        const record = await transaction.store.get(cacheKey);
        if (record === undefined) {
          await transaction.done;
          this.#memoryRenders.delete(cacheKey);
          return null;
        }
        if (!isStoredRender(record)) {
          await transaction.store.delete(cacheKey);
          await transaction.done;
          return null;
        }
        const touched = { ...record, lastViewedAt: now };
        await transaction.store.put(touched);
        await transaction.done;
        this.#memoryRenders.set(cacheKey, touched);
        notifyStorageChange("render-accessed", cacheKey);
        return cloneRender(touched);
      } catch {
        this.#backend.disable(database);
      }
    }

    const record = this.#memoryRenders.get(cacheKey);
    if (!record) return null;
    const touched = { ...record, lastViewedAt: now };
    this.#memoryRenders.set(cacheKey, touched);
    notifyStorageChange("render-accessed", cacheKey);
    return cloneRender(touched);
  }

  /** Lists validated browser-local previews without requiring live provider config. */
  async listRendersForPhoto(userPhotoDigest: string): Promise<StoredDrapeRender[]> {
    const digest = normalizeSha256(userPhotoDigest);
    const database = await this.#backend.database();
    if (database) {
      try {
        const records = await readIndexedDbRendersForPhoto(database, digest);
        records.forEach((record) =>
          this.#memoryRenders.set(record.cacheKey, record),
        );
        return records.map(cloneRender);
      } catch {
        this.#backend.disable(database);
      }
    }

    return readMemoryRendersForPhoto(this.#memoryRenders.values(), digest).map(
      cloneRender,
    );
  }

  async deleteRender(cacheKey: string): Promise<void> {
    assertRenderCacheKey(cacheKey);
    const database = await this.#backend.database();
    if (database) {
      try {
        await database.delete("renders", cacheKey);
        this.#memoryRenders.delete(cacheKey);
        notifyStorageChange("render-deleted", cacheKey);
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#backend.assertPersistentDeletionComplete();
    this.#memoryRenders.delete(cacheKey);
    notifyStorageChange("render-deleted", cacheKey);
  }

  async clearRenders(): Promise<void> {
    const database = await this.#backend.database();
    if (database) {
      try {
        await database.clear("renders");
        this.#memoryRenders.clear();
        notifyStorageChange("renders-cleared");
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#backend.assertPersistentDeletionComplete();
    this.#memoryRenders.clear();
    notifyStorageChange("renders-cleared");
  }

  async getRenderStats(): Promise<DrapeRoomRenderStats> {
    const database = await this.#backend.database();
    let renders: StoredDrapeRender[];
    if (database) {
      try {
        renders = (await database.getAll("renders")).filter(isStoredRender);
        this.#memoryRenders.clear();
        renders.forEach((render) =>
          this.#memoryRenders.set(render.cacheKey, render),
        );
        return renderStats(renders);
      } catch {
        this.#backend.disable(database);
      }
    }
    renders = [...this.#memoryRenders.values()];
    return renderStats(renders);
  }

  async setMetadata(
    key: string,
    value: DrapeRoomMetadataValue,
  ): Promise<void> {
    const safeKey = normalizeMetadataKey(key);
    const safeValue = cloneMetadataValue(value);
    const record: StoredMetadata = {
      key: safeKey,
      value: safeValue,
      updatedAt: this.#clock.next(),
    };
    const database = await this.#backend.database();
    if (database) {
      try {
        await database.put("metadata", record);
        this.#memoryMetadata.set(safeKey, record);
        notifyStorageChange("metadata-updated", safeKey);
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#memoryMetadata.set(safeKey, record);
    notifyStorageChange("metadata-updated", safeKey);
  }

  async getMetadata(
    key: string,
  ): Promise<DrapeRoomMetadataValue | null> {
    const safeKey = normalizeMetadataKey(key);
    const database = await this.#backend.database();
    if (database) {
      try {
        const record = await database.get("metadata", safeKey);
        if (record) this.#memoryMetadata.set(safeKey, record);
        else this.#memoryMetadata.delete(safeKey);
        return record ? cloneMetadataValue(record.value) : null;
      } catch {
        this.#backend.disable(database);
      }
    }
    const record = this.#memoryMetadata.get(safeKey);
    return record ? cloneMetadataValue(record.value) : null;
  }

  async deleteMetadata(key: string): Promise<void> {
    const safeKey = normalizeMetadataKey(key);
    const database = await this.#backend.database();
    if (database) {
      try {
        await database.delete("metadata", safeKey);
        this.#memoryMetadata.delete(safeKey);
        notifyStorageChange("metadata-deleted", safeKey);
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#backend.assertPersistentDeletionComplete();
    this.#memoryMetadata.delete(safeKey);
    notifyStorageChange("metadata-deleted", safeKey);
  }

  /** Clears image and metadata stores, but deliberately leaves consent alone. */
  async clearAllData(): Promise<void> {
    const database = await this.#backend.database();
    if (database) {
      try {
        const transaction = database.transaction(
          ["photos", "renders", "metadata"],
          "readwrite",
        );
        await Promise.all([
          transaction.objectStore("photos").clear(),
          transaction.objectStore("renders").clear(),
          transaction.objectStore("metadata").clear(),
        ]);
        await transaction.done;
        this.#memoryPhoto = null;
        this.#memoryRenders.clear();
        this.#memoryMetadata.clear();
        notifyStorageChange("all-cleared");
        return;
      } catch {
        this.#backend.disable(database);
      }
    }
    this.#backend.assertPersistentDeletionComplete();
    this.#memoryPhoto = null;
    this.#memoryRenders.clear();
    this.#memoryMetadata.clear();
    notifyStorageChange("all-cleared");
  }

  dispose(): void {
    this.#backend.dispose();
  }
}

export const drapeRoomStorage = new DrapeRoomClientStorage();
