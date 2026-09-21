import {
  AnyColumn,
  and,
  desc,
  eq,
  inArray,
  InferInsertModel,
  InferSelectModel,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias, QueryBuilder } from "drizzle-orm/pg-core";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { addresses, users } from "@/db/schema";
import { normalizeOtpPhone } from "@/lib/auth/otp";

type AddressRecord = InferSelectModel<typeof addresses>;
type UserRecord = InferSelectModel<typeof users>;

export type UserWithDefaultAddress = UserRecord & {
  defaultAddress: AddressRecord | null;
};

export type UpdateUserInput = Partial<
  Omit<InferInsertModel<typeof users>, "createdAt" | "id" | "updatedAt">
>;

export type CheckoutCustomerInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
};

const hydrateUsers = async (rows: UserRecord[]): Promise<UserWithDefaultAddress[]> => {
  if (rows.length === 0) return [];

  const addressIds = Array.from(
    new Set(
      rows.map((row) => row.defaultAddressId).filter((value): value is string => Boolean(value))
    )
  );

  const addressRows =
    addressIds.length > 0
      ? await withRetry(() => db.select().from(addresses).where(inArray(addresses.id, addressIds)))
      : [];
  const addressById = new Map(addressRows.map((row) => [row.id, row]));

  return rows.map((row) => ({
    ...row,
    defaultAddress: row.defaultAddressId ? addressById.get(row.defaultAddressId) ?? null : null,
  }));
};

export const listUsers = async (options?: {
  limit?: number;
  offset?: number;
  role?: UserRecord["role"];
}): Promise<UserWithDefaultAddress[]> => {
  const {
    limit = 100,
    offset = 0,
    role,
  } = options ?? {};

  const whereClause = role ? eq(users.role, role) : undefined;

  const rows = await withRetry(() =>
    db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateUsers(rows);
};

export const getUserById = async (id: string): Promise<UserWithDefaultAddress | null> => {
  const [row] = await withRetry(() =>
    db.select().from(users).where(eq(users.id, id)).limit(1)
  );
  if (!row) return null;
  const [hydrated] = await hydrateUsers([row]);
  return hydrated ?? null;
};

export const getUserByEmail = async (email: string): Promise<UserWithDefaultAddress | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)
  );

  if (!row) return null;
  const [hydrated] = await hydrateUsers([row]);
  return hydrated ?? null;
};

export const getOrCreateCheckoutCustomer = async ({
  email,
  name,
  phone,
}: CheckoutCustomerInput): Promise<UserWithDefaultAddress | null> => {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.passwordHash) return null;
    return existing;
  }

  try {
    const created = requireFirstRow(
      await db
        .insert(users)
        .values({
          email: normalizedEmail,
          metadata: {
            source: "checkout",
          },
          name: name?.trim() || null,
          phone: phone?.trim() || null,
          role: "customer",
          updatedAt: new Date(),
        })
        .returning(),
      "Failed to create checkout customer."
    );

    const [hydrated] = await hydrateUsers([created]);
    if (!hydrated) {
      throw new Error("Failed to load checkout customer.");
    }

    return hydrated;
  } catch (error) {
    const raced = await getUserByEmail(normalizedEmail);
    if (raced) {
      if (raced.passwordHash) return null;
      return raced;
    }
    throw error;
  }
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput
): Promise<UserWithDefaultAddress | null> => {
  const updated = getFirstRow(
    await db
      .update(users)
      .set({
        ...input,
        email: input.email?.toLowerCase(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()
  );

  if (!updated) return null;
  const [hydrated] = await hydrateUsers([updated]);
  return hydrated ?? null;
};

export type ClaimCheckoutShellFields = {
  passwordHash: string;
  name?: string;
};

/**
 * Atomically upgrades a checkout shell row to a full account.
 * The WHERE predicate includes `password_hash IS NULL` so that only one
 * concurrent writer succeeds — the loser gets null back (0 rows returned).
 */
export const claimCheckoutShell = async (
  userId: string,
  fields: ClaimCheckoutShellFields
): Promise<UserWithDefaultAddress | null> => {
  const updated = getFirstRow(
    await db
      .update(users)
      .set({
        passwordHash: fields.passwordHash,
        name: fields.name,
        role: "customer",
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.passwordHash)))
      .returning()
  );

  if (!updated) return null;
  const [hydrated] = await hydrateUsers([updated]);
  return hydrated ?? null;
};

export type FillMissingCheckoutProfileInput = {
  userId: string;
  name?: string | null;
  phone?: string | null;
  now?: Date;
};

export type FillMissingCheckoutProfileResult = {
  nameFilled: boolean;
  phoneFilled: boolean;
};

const otherUsers = alias(users, "other_users");
// The phone-owner subquery is only a fragment of the UPDATE below, never run
// on its own, so it is built without a connection.
const fragmentQuery = new QueryBuilder();

const isMissing = (column: AnyColumn) => or(isNull(column), sql`btrim(${column}) = ''`);

/** A national number is the last ten digits of a phone, however it was typed. */
const NATIONAL_NUMBER_DIGITS = 10;

/**
 * Whether a stored phone is this E.164 number in any format.
 *
 * Only digits are compared, so "+91 98765-43210" is the same line as
 * "+919876543210". A value that holds just the national number, perhaps behind
 * a trunk 0, counts too: its last ten digits are the number's last ten.
 */
const isSamePhoneNumber = (column: AnyColumn, e164Phone: string) => {
  const digits = e164Phone.slice(1);
  const storedDigits = sql`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return or(
    sql`${storedDigits} = ${digits}`,
    sql`right(${storedDigits}, ${sql.raw(String(NATIONAL_NUMBER_DIGITS))}) = ${digits.slice(-NATIONAL_NUMBER_DIGITS)}`,
  );
};

const toE164Phone = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  try {
    return normalizeOtpPhone(phone);
  } catch {
    return null;
  }
};

/**
 * Fills the account owner's name and phone from checkout, only where missing.
 *
 * Stored values that are already valid always win: every write is guarded in
 * SQL so it never overwrites. Email is deliberately out of reach; the verified
 * login email stays the account's identity. Name and phone are separate
 * UPDATEs so one field can fill even when the other cannot.
 *
 * users.phone doubles as an OTP login identity and its index is not unique,
 * so a phone is stored only in E.164 form and only when no other account
 * already holds that number in any format. Otherwise a phone sign-in could
 * reach the wrong account.
 */
export const fillMissingCheckoutProfile = async ({
  userId,
  name,
  phone,
  now = new Date(),
}: FillMissingCheckoutProfileInput): Promise<FillMissingCheckoutProfileResult> => {
  const trimmedName = name?.trim();
  const e164Phone = toE164Phone(phone);

  const nameRow = trimmedName
    ? getFirstRow(
        await db
          .update(users)
          .set({ name: trimmedName, updatedAt: now })
          .where(and(eq(users.id, userId), isMissing(users.name)))
          .returning({ id: users.id })
      )
    : undefined;

  const phoneRow = e164Phone
    ? getFirstRow(
        await db
          .update(users)
          .set({ phone: e164Phone, updatedAt: now })
          .where(
            and(
              eq(users.id, userId),
              isMissing(users.phone),
              notExists(
                fragmentQuery
                  .select({ one: sql`1` })
                  .from(otherUsers)
                  .where(
                    and(isSamePhoneNumber(otherUsers.phone, e164Phone), ne(otherUsers.id, userId))
                  )
              )
            )
          )
          .returning({ id: users.id })
      )
    : undefined;

  return { nameFilled: Boolean(nameRow), phoneFilled: Boolean(phoneRow) };
};
