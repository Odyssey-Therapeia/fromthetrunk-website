import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      // Next aliases `server-only` itself; vitest needs the same no-op stub so
      // server-only modules (e.g. lib/journal/articles.ts) can be unit tested.
      "server-only": path.join(rootDir, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    // The money-math suite asserts the CHARGED behaviour (₹ shipping + GST),
    // which is now gated OFF by default in the app (launch = free shipping / no
    // GST). Enable the charges in the test env so the suite keeps locking the
    // restorable pricing logic (toShippingCostPaise / calculateOrderTotals).
    env: {
      NEXT_PUBLIC_FTT_ENABLE_SHIPPING_CHARGES: "true",
      NEXT_PUBLIC_FTT_ENABLE_GST: "true",
    },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    restoreMocks: true,
  },
});
