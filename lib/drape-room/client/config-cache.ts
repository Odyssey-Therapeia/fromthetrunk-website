export const DRAPE_ROOM_CONFIG_STALE_MS = 5 * 60 * 1_000;
/**
 * Refresh one minute before the five-minute consent token can expire. This
 * keeps a Drape Room that remains open from submitting an already-expired
 * token while preserving the server's short, fail-closed token lifetime.
 */
export const DRAPE_ROOM_CONFIG_REFRESH_MS = 4 * 60 * 1_000;

export function isDrapeRoomConfigFresh(
  loadedAt: number,
  now = Date.now(),
): boolean {
  return (
    Number.isSafeInteger(loadedAt) &&
    Number.isSafeInteger(now) &&
    loadedAt > 0 &&
    now >= loadedAt &&
    now - loadedAt < DRAPE_ROOM_CONFIG_STALE_MS
  );
}

export function millisecondsUntilDrapeRoomConfigRefresh(
  loadedAt: number,
  now = Date.now(),
): number {
  if (
    !Number.isSafeInteger(loadedAt) ||
    !Number.isSafeInteger(now) ||
    loadedAt <= 0 ||
    now < loadedAt
  ) {
    return 0;
  }
  return Math.max(0, loadedAt + DRAPE_ROOM_CONFIG_REFRESH_MS - now);
}
