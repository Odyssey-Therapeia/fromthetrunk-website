"use client";

import { openDB, type IDBPDatabase } from "idb";

import {
  DRAPE_ROOM_DB_NAME,
  DRAPE_ROOM_DB_VERSION,
  type DrapeRoomDatabase,
} from "./storage-schema";

const PERSISTENT_DELETE_ERROR =
  "Your Drape Room data could not be removed from browser storage.";

export class DrapeRoomStorageBackend {
  readonly #forceMemory: boolean;
  #databasePromise: Promise<IDBPDatabase<DrapeRoomDatabase> | null> | null =
    null;
  #indexedDbFailed = false;
  #persistentDataMayExist = false;

  constructor(forceMemory: boolean) {
    this.#forceMemory = forceMemory;
  }

  async database(): Promise<IDBPDatabase<DrapeRoomDatabase> | null> {
    if (
      this.#forceMemory ||
      this.#indexedDbFailed ||
      typeof indexedDB === "undefined"
    ) {
      return null;
    }
    this.#databasePromise ??= openDB<DrapeRoomDatabase>(
      DRAPE_ROOM_DB_NAME,
      DRAPE_ROOM_DB_VERSION,
      {
        upgrade(database, oldVersion) {
          if (oldVersion >= 1) return;
          database.createObjectStore("photos", { keyPath: "key" });
          const renders = database.createObjectStore("renders", {
            keyPath: "cacheKey",
          });
          renders.createIndex("userPhotoDigest", "userPhotoDigest");
          renders.createIndex("productId", "productId");
          renders.createIndex("lastViewedAt", "lastViewedAt");
          renders.createIndex("createdAt", "createdAt");
          database.createObjectStore("metadata", { keyPath: "key" });
        },
      },
    ).catch(() => {
      this.#indexedDbFailed = true;
      this.#persistentDataMayExist = true;
      return null;
    });
    const database = await this.#databasePromise;
    if (database) this.#persistentDataMayExist = true;
    return database;
  }

  disable(database: IDBPDatabase<DrapeRoomDatabase>): void {
    database.close();
    this.#indexedDbFailed = true;
    this.#persistentDataMayExist = true;
    this.#databasePromise = Promise.resolve(null);
  }

  cannotGuaranteePersistentClear(): boolean {
    return this.#indexedDbFailed && this.#persistentDataMayExist;
  }

  assertPersistentDeletionComplete(): void {
    if (this.cannotGuaranteePersistentClear()) {
      throw new Error(PERSISTENT_DELETE_ERROR);
    }
  }

  dispose(): void {
    void this.#databasePromise?.then((database) => database?.close());
    this.#databasePromise = null;
  }
}

export class MonotonicStorageClock {
  readonly #now: () => number;
  #lastTimestamp = -1;

  constructor(now: () => number) {
    this.#now = now;
  }

  next(): number {
    const clockValue = this.#now();
    if (!Number.isSafeInteger(clockValue) || clockValue < 0) {
      throw new Error("The Drape Room storage clock is invalid.");
    }
    const value = Math.max(clockValue, this.#lastTimestamp + 1);
    if (!Number.isSafeInteger(value)) {
      throw new Error("The Drape Room storage clock is exhausted.");
    }
    this.#lastTimestamp = value;
    return value;
  }
}
