export type TimingEntry = {
  description?: string;
  durationMs: number;
  name: string;
};

export type TimingSink = (entry: TimingEntry) => void;

export const roundDuration = (durationMs: number) =>
  Math.round(durationMs * 10) / 10;

const safeToken = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const safeDescription = (value: string) =>
  value.replace(/["\\\r\n]/g, "").slice(0, 80);

export const formatServerTiming = (timings: TimingEntry[]) =>
  timings
    .map((entry) => {
      const name = safeToken(entry.name);
      const parts = [name];
      if (entry.description) {
        parts.push(`desc="${safeDescription(entry.description)}"`);
      }
      parts.push(`dur=${roundDuration(entry.durationMs)}`);
      return parts.join(";");
    })
    .join(", ");

export const timeAsync = async <T>(
  sink: TimingEntry[] | TimingSink | undefined,
  name: string,
  fn: () => Promise<T>,
  description?: string,
) => {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    const entry = {
      description,
      durationMs: roundDuration(performance.now() - startedAt),
      name,
    };
    if (Array.isArray(sink)) {
      sink.push(entry);
    } else {
      sink?.(entry);
    }
  }
};

export const timeSync = <T>(
  sink: TimingEntry[] | TimingSink | undefined,
  name: string,
  fn: () => T,
  description?: string,
) => {
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    const entry = {
      description,
      durationMs: roundDuration(performance.now() - startedAt),
      name,
    };
    if (Array.isArray(sink)) {
      sink.push(entry);
    } else {
      sink?.(entry);
    }
  }
};
