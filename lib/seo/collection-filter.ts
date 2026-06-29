export function hasCollectionFilterParams(
  params: Record<string, string | string[] | undefined> | undefined,
): boolean {
  return Object.values(params ?? {}).some((value) =>
    Array.isArray(value)
      ? value.some((entry) => entry.trim().length > 0)
      : typeof value === "string" && value.trim().length > 0,
  );
}
