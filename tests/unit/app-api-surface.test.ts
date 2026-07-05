import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP_API_DIR = join(process.cwd(), "app", "api");

const listRouteFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(path);
    if (entry.name !== "route.ts") return [];
    return relative(process.cwd(), path);
  });

describe("app/api route surface", () => {
  it("keeps app/api limited to framework-required route handlers", () => {
    expect(listRouteFiles(APP_API_DIR).sort()).toEqual([
      "app/api/auth/[...nextauth]/route.ts",
      "app/api/preview/route.ts",
      "app/api/v2/[...route]/route.ts",
    ]);
  });
});
