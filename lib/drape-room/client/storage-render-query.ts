"use client";

import type { IDBPDatabase } from "idb";

import { isStoredRender, sortRendersMostRecent } from "./storage-policy";
import type {
  DrapeRoomDatabase,
  StoredDrapeRender,
} from "./storage-schema";

export async function readIndexedDbRendersForPhoto(
  database: IDBPDatabase<DrapeRoomDatabase>,
  digest: string,
): Promise<StoredDrapeRender[]> {
  const transaction = database.transaction("renders", "readonly");
  const records = (
    await transaction.store.index("userPhotoDigest").getAll(digest)
  ).filter(isStoredRender);
  await transaction.done;
  return sortRendersMostRecent(records);
}

export function readMemoryRendersForPhoto(
  records: Iterable<StoredDrapeRender>,
  digest: string,
): StoredDrapeRender[] {
  return sortRendersMostRecent(
    [...records].filter(
      (record) =>
        record.userPhotoDigest === digest && isStoredRender(record),
    ),
  );
}
