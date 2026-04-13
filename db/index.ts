import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Agent, fetch as undiciFetch } from "undici";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize the Drizzle client.");
}

const ipv4Agent = new Agent({ connect: { family: 4 } });
neonConfig.fetchFunction = (url: string | URL | Request, init?: RequestInit) =>
  undiciFetch(url as string, { ...init, dispatcher: ipv4Agent } as Parameters<typeof undiciFetch>[1]);

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export type Database = typeof db;

/** Raw Neon SQL for queries Drizzle can't express (e.g. pgvector). */
export { sql as rawSql };

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry a DB operation once on transient Neon HTTP failures.
 * Rarely needed with the HTTP driver, kept as a safety net.
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;

      const isRetryable =
        error instanceof Error &&
        (error.message.includes("fetch failed") ||
          error.message.includes("Failed query"));

      if (!isRetryable) break;

      console.warn(
        `[db] Query failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAY_MS}ms…`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}
