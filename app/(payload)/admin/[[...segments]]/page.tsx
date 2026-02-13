import { RootPage } from "@payloadcms/next/views";

import config from "@/payload.config";
import { importMap } from "@/payload/importMap";

export default function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }> | { segments?: string[] };
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}) {
  const resolvedParams = Promise.resolve(params).then((p) => ({
    segments: ("segments" in p ? p.segments : undefined) ?? [],
  }));

  const resolvedSearchParams = Promise.resolve(searchParams).then((sp) => {
    const cleaned: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(sp)) {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  });

  return (
    <RootPage
      config={config}
      importMap={importMap}
      params={resolvedParams}
      searchParams={resolvedSearchParams}
    />
  );
}
