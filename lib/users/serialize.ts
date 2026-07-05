type UserResponseSource = {
  metadata?: unknown;
  passwordHash?: unknown;
};

export function serializeUserForClient<T extends UserResponseSource>(
  user: T
): Omit<T, "metadata" | "passwordHash"> {
  const safeUser = { ...user } as Record<string, unknown>;
  delete safeUser.passwordHash;
  delete safeUser.metadata;
  return safeUser as Omit<T, "metadata" | "passwordHash">;
}

export function serializeAdminUserForClient<T extends UserResponseSource>(
  user: T
): Omit<T, "metadata" | "passwordHash"> {
  return serializeUserForClient(user);
}
