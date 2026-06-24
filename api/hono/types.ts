export type AuthUser = {
  email?: string | null;
  id: string;
  role?: string | null;
};

export type HonoTimingEntry = {
  description?: string;
  durationMs: number;
  name: string;
};

export type HonoVariables = {
  authUser: AuthUser | null;
  perfStartedAt?: number;
  perfTimings?: HonoTimingEntry[];
};

export type HonoBindings = {
  Variables: HonoVariables;
};
