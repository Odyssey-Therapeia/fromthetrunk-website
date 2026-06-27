import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import TwitterProvider from "next-auth/providers/twitter";

import { consumeOtpLoginTicket, createAuthSecurityEvent } from "@/db/queries/auth-otp";
import { getUserByEmail } from "@/db/queries/users";
import { getUserById } from "@/db/queries/users";
import { DrizzleAdapter } from "@/lib/auth/drizzle-adapter";
import { checkRateLimit } from "@/lib/http/rate-limit";
import { timed } from "@/lib/perf/timed";
import { isDurableRateLimiterConfigured } from "@/lib/ports/rate-limiter";

const providers: NonNullable<NextAuthOptions["providers"]> = [];

const hashRateLimitPart = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const getHeaderValue = (headers: unknown, name: string): string | null => {
  if (headers instanceof Headers) return headers.get(name);
  if (!headers || typeof headers !== "object") return null;

  const record = headers as Record<string, unknown>;
  const value = record[name] ?? record[name.toLowerCase()];
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
};

const getPasswordAuthIp = (request: unknown): string => {
  const headers = (request as { headers?: unknown } | null)?.headers;
  const realIp = getHeaderValue(headers, "x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = getHeaderValue(headers, "x-forwarded-for");
  return forwarded?.split(",").pop()?.trim() || "unknown";
};

const isPasswordAuthorizeAllowed = async (email: string, request: unknown) => {
  if (process.env.NODE_ENV === "production" && !isDurableRateLimiterConfigured()) {
    return false;
  }

  const ip = getPasswordAuthIp(request);
  const result = await checkRateLimit(
    `auth:password:${hashRateLimitPart(ip)}:${hashRateLimitPart(email)}`,
    {
      limit: 5,
      requireDurable: true,
      windowSeconds: 5 * 60,
    }
  );
  return result.success;
};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
    })
  );
}

if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
  providers.push(
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    })
  );
}

providers.push(
  CredentialsProvider({
    id: "credentials",
    name: "Email and Password",
    credentials: {
      email: {
        label: "Email",
        type: "email",
      },
      password: {
        label: "Password",
        type: "password",
      },
    },
	    async authorize(credentials, request) {
	      const email = credentials?.email?.trim().toLowerCase();
	      const password = credentials?.password;

	      if (!email || !password) {
	        return null;
	      }

	      try {
	        const allowed = await isPasswordAuthorizeAllowed(email, request);
	        if (!allowed) return null;

	        const user = await getUserByEmail(email);
        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          role: user.role,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      } catch {
        return null;
      }
    },
  })
);

providers.push(
  {
    authorize: async (credentials) => {
      const loginTicket = credentials?.loginTicket?.trim();
      if (!loginTicket) return null;

      try {
        const challenge = await timed("auth.nextauth.emailOtp.consumeTicket", () =>
          consumeOtpLoginTicket(loginTicket, new Date(), [
            "checkout",
            "sign_in",
          ])
        );
        if (!challenge?.userId) return null;

        const userId = challenge.userId;
        const user = await timed("auth.nextauth.emailOtp.getUser", () =>
          getUserById(userId)
        );
        if (!user) return null;

        if (user.role !== "customer") {
          await timed("auth.nextauth.emailOtp.securityEvent.adminRejected", () =>
            createAuthSecurityEvent({
              eventType: "otp_admin_rejected",
              identifierNormalized: challenge.identifierNormalized,
              identifierType: challenge.identifierType,
              ipHash: null,
              metadata: {
                challengeId: challenge.id,
                provider: "email-otp",
                reason: "admin_otp_not_allowed",
                role: user.role,
              },
              userAgentHash: null,
              userId: user.id,
            })
          ).catch(() => undefined);

          return null;
        }

        await timed("auth.nextauth.emailOtp.securityEvents.consumed", () =>
          Promise.all([
            createAuthSecurityEvent({
              eventType: "otp_consumed",
              identifierNormalized: challenge.identifierNormalized,
              identifierType: challenge.identifierType,
              ipHash: null,
              metadata: {
                challengeId: challenge.id,
                provider: "email-otp",
              },
              userAgentHash: null,
              userId: user.id,
            }),
            createAuthSecurityEvent({
              eventType: "otp_login_ticket_consumed",
              identifierNormalized: challenge.identifierNormalized,
              identifierType: challenge.identifierType,
              ipHash: null,
              metadata: {
                challengeId: challenge.id,
                provider: "email-otp",
              },
              userAgentHash: null,
              userId: user.id,
            }),
          ])
        ).catch(() => undefined);

        return {
          id: user.id,
          role: user.role,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      } catch {
        return null;
      }
    },
    credentials: {
      loginTicket: {
        label: "Login ticket",
        type: "text",
      },
    },
    id: "email-otp",
    name: "Email OTP",
    type: "credentials",
  } satisfies CredentialsConfig<{
    loginTicket: {
      label: string;
      type: string;
    };
  }>
);

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(),
  session: {
    strategy: "jwt",
  },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      if (user && "role" in user && typeof user.role === "string") {
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token, user }) {
      const resolvedId =
        user?.id ?? (typeof token.id === "string" ? token.id : token.sub);

      if (session.user && resolvedId) {
        session.user.id = resolvedId;
        if (typeof token.role === "string") {
          session.user.role = token.role;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/account/sign-in",
  },
};
