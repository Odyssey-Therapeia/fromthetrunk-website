import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

const compareMock = vi.hoisted(() => vi.fn());
const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const hashMock = vi.hoisted(() => vi.fn());
const listUsersMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());

vi.mock("bcryptjs", () => ({
  default: {
    compare: compareMock,
    hash: hashMock,
  },
}));

vi.mock("@/db", () => ({
  db: {},
}));

vi.mock("@/db/queries/users", () => ({
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
  listUsers: listUsersMock,
  updateUser: updateUserMock,
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn().mockResolvedValue(null),
}));

import { registerUserRoutes } from "@/api/hono/routes/users";
import type { HonoBindings } from "@/api/hono/types";

const createUsersApp = (authUser: null | { email?: null | string; id: string; role?: null | string }) => {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", authUser ?? null);
    await next();
  });
  registerUserRoutes(app);
  return app;
};

describe("user profile responses", () => {
  beforeEach(() => {
    compareMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    hashMock.mockReset();
    listUsersMock.mockReset();
    updateUserMock.mockReset();
  });

  it("GET /me excludes passwordHash and metadata", async () => {
    getUserByIdMock.mockResolvedValue({
      createdAt: new Date(),
      defaultAddress: null,
      defaultAddressId: null,
      email: "customer@example.com",
      emailVerified: null,
      id: "user-123",
      image: null,
      metadata: { authMethod: "password" },
      name: "Customer",
      passwordHash: "stored-hash",
      phone: null,
      role: "customer",
      updatedAt: new Date(),
    });

    const response = await createUsersApp({
      email: "customer@example.com",
      id: "user-123",
      role: "customer",
    }).request("/me");

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty("passwordHash");
    expect(json).not.toHaveProperty("metadata");
  });

  it("PATCH /me excludes passwordHash and metadata", async () => {
    updateUserMock.mockResolvedValue({
      createdAt: new Date(),
      defaultAddress: null,
      defaultAddressId: null,
      email: "customer@example.com",
      emailVerified: null,
      id: "user-123",
      image: null,
      metadata: { authMethod: "password" },
      name: "Updated",
      passwordHash: "stored-hash",
      phone: null,
      role: "customer",
      updatedAt: new Date(),
    });

    const response = await createUsersApp({
      email: "customer@example.com",
      id: "user-123",
      role: "customer",
    }).request("/me", {
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty("passwordHash");
    expect(json).not.toHaveProperty("metadata");
  });
});

describe("PATCH /me/password", () => {
  beforeEach(() => {
    compareMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    hashMock.mockReset();
    listUsersMock.mockReset();
    updateUserMock.mockReset();
  });

  it("returns unauthorized when no session is present", async () => {
    const response = await createUsersApp(null).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "Current123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid current password", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "user-123",
      passwordHash: "stored-hash",
    });
    compareMock.mockResolvedValue(false);

    const response = await createUsersApp({
      email: "admin@example.com",
      id: "user-123",
      role: "admin",
    }).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "WrongPassword123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("returns a clear error when the account has no password hash", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "user-123",
      passwordHash: null,
    });

    const response = await createUsersApp({
      email: "admin@example.com",
      id: "user-123",
      role: "admin",
    }).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "Current123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "PASSWORD_NOT_SET",
    });
    expect(compareMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("hashes and saves the new password after verifying the current one", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "user-123",
      passwordHash: "stored-hash",
    });
    compareMock.mockResolvedValue(true);
    hashMock.mockResolvedValue("new-hash");
    updateUserMock.mockResolvedValue({
      id: "user-123",
    });

    const response = await createUsersApp({
      email: "admin@example.com",
      id: "user-123",
      role: "admin",
    }).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "Current123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
    });
    expect(compareMock).toHaveBeenCalledWith("Current123", "stored-hash");
    expect(hashMock).toHaveBeenCalledWith("NewSecure123", 12);
    expect(updateUserMock).toHaveBeenCalledWith("user-123", {
      passwordHash: "new-hash",
    });
  });
});
