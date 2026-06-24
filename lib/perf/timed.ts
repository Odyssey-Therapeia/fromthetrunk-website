export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
  requestId = "global",
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await fn();
  } finally {
    if (process.env.PERF_DEBUG === "1") {
      const ms = Math.round(performance.now() - startedAt);
      console.log(`[perf:${requestId}] ${label}: ${ms}ms`);
    }
  }
}
