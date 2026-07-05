import { beforeEach, describe, expect, it, vi } from "vitest";

const createProductMock = vi.hoisted(() => vi.fn());
const getProductTypeByIdMock = vi.hoisted(() => vi.fn());
const slugifyMock = vi.hoisted(() => vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, "-")));

vi.mock("@/db/queries/products", () => ({
  createProduct: createProductMock,
}));

vi.mock("@/db/queries/product-types", () => ({
  getProductTypeById: getProductTypeByIdMock,
}));

vi.mock("@/lib/utils", () => ({
  slugify: slugifyMock,
}));

import {
  MAX_CSV_COLUMNS,
  MAX_CSV_FILE_BYTES,
  MAX_CSV_ROWS,
} from "@/api/hono/schemas/admin-import";
import { registerAdminImportRoutes } from "@/api/hono/routes/admin-import";
import { createRouteHarness } from "../helpers/route-harness";

const ADMIN_1 = { id: "admin-1", email: "admin1@example.com", role: "admin" as const };
const ADMIN_2 = { id: "admin-2", email: "admin2@example.com", role: "admin" as const };

const MAPPINGS = [
  { confidence: 1, csvColumn: "name", dbField: "name", status: "mapped" as const },
  { confidence: 1, csvColumn: "storyTitle", dbField: "storyTitle", status: "mapped" as const },
  { confidence: 1, csvColumn: "pricePaise", dbField: "pricePaise", status: "mapped" as const },
];

const formWithCsv = (csv: string, filename = "products.csv") => {
  const formData = new FormData();
  formData.append("file", new File([csv], filename, { type: "text/csv" }));
  return formData;
};

const parseCsv = (authUser = ADMIN_1, csv = "name,storyTitle,pricePaise\nSaree,Story,50000") => {
  const { request } = createRouteHarness({
    authUser,
    register: registerAdminImportRoutes,
  });
  return request("/parse", { body: formWithCsv(csv), method: "POST" });
};

describe("admin import caps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects oversized CSV files before parsing", async () => {
    const response = await parseCsv(ADMIN_1, "a".repeat(MAX_CSV_FILE_BYTES + 1));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("CSV_TOO_LARGE");
  });

  it("rejects too many rows", async () => {
    const rows = Array.from(
      { length: MAX_CSV_ROWS + 1 },
      (_, index) => `Saree ${index},Story,50000`,
    );
    const response = await parseCsv(
      ADMIN_1,
      `name,storyTitle,pricePaise\n${rows.join("\n")}`,
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("CSV_TOO_MANY_ROWS");
  });

  it("rejects too many columns", async () => {
    const headers = Array.from({ length: MAX_CSV_COLUMNS + 1 }, (_, index) => `col${index}`);
    const values = headers.map(() => "x");
    const response = await parseCsv(ADMIN_1, `${headers.join(",")}\n${values.join(",")}`);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("CSV_TOO_MANY_COLUMNS");
  });

  it("rejects malformed CSV safely", async () => {
    const response = await parseCsv(ADMIN_1, 'name,storyTitle,pricePaise\n"Saree,Story,50000');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe("CSV_MALFORMED");
  });

  it("does not allow another admin to reuse a parsed fileId", async () => {
    const parseResponse = await parseCsv();
    expect(parseResponse.status).toBe(200);
    const { fileId } = (await parseResponse.json()) as { fileId: string };

    const { request } = createRouteHarness({
      authUser: ADMIN_2,
      register: registerAdminImportRoutes,
    });
    const validateResponse = await request("/validate", {
      body: JSON.stringify({ fileId, mappings: MAPPINGS }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const json = await validateResponse.json();

    expect(validateResponse.status).toBe(400);
    expect(json.code).toBe("FILE_EXPIRED");
  });
});
