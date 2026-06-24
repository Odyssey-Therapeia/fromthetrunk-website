import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { resolveRedirect } from "@/lib/content/redirect-resolver";

/**
 * Proxy handles:
 * 1. Route protection — redirect unauthenticated users from protected paths
 * 2. Security — additional runtime security checks
 * 3. P3-09: Managed redirects — consult the redirects table for any path
 *    not handled by auth checks above.
 *
 * Renamed from middleware.ts to proxy.ts for Next.js 16 convention.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * CRITICAL: the redirect consultation is ADDITIVE.
 * The auth-protection logic is unchanged.
 * Redirect paths excluded from consultation:
 *   - /api/* (Hono API routes — never redirect)
 *   - /collection/:slug (PDP route handles product 404)
 *   - /account/* (auth protection runs instead)
 *   - Next.js internals (_next/*)
 */

const protectedPaths = [
  "/account/profile",
  "/account/addresses",
  "/account/orders",
  "/account/wishlist",
];

const PUBLIC_FILE =
  /\.(?:png|jpg|jpeg|webp|gif|svg|avif|ico|css|js|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|mov|m4v|pdf)$/i;

const publicAssetPrefixes = [
  "/dev-uploads/",
  "/media/",
  "/banner/",
  "/category/",
  "/hero/",
  "/logos/",
  "/fonts/",
  "/videos/",
];

const publicAssetPaths = new Set([
  "/apple-icon.svg",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon-192.png",
  "/icon.svg",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
]);

const isProtected = (pathname: string) =>
  protectedPaths.some((prefix) => pathname.startsWith(prefix));

const isPublicAssetPath = (pathname: string): boolean =>
  pathname.startsWith("/_next/") ||
  pathname.startsWith("/.well-known/") ||
  publicAssetPaths.has(pathname) ||
  publicAssetPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
  PUBLIC_FILE.test(pathname);

/**
 * Paths excluded from redirect consultation.
 * These are handled by dedicated logic above (auth) or must
 * never be intercepted (API routes, Next.js internals).
 *
 * MONEY PATH GUARD: /checkout/* and /cart/* are explicitly excluded so that
 * an admin-created redirect can never break the guest-checkout payment flow.
 * Even if a redirect row exists for /checkout or /cart, the proxy will pass
 * through to the Next.js route handler unchanged.
 */
const isExcludedFromRedirectCheck = (pathname: string): boolean =>
  isPublicAssetPath(pathname) ||
  pathname.startsWith("/api/") ||
  pathname.startsWith("/account/") ||
  pathname === "/collection" ||
  pathname.startsWith("/collection/") ||
  pathname.startsWith("/checkout") ||
  pathname.startsWith("/cart");

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  if (isPublicAssetPath(pathname)) {
    return response;
  }

  // ─── Route Protection ───────────────────────────────────────────
  if (isProtected(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const signInUrl = new URL("/account/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // ─── P3-09: Managed redirects ───────────────────────────────────
  // Additive: only runs for paths not already handled by product-404 or auth.
  // Never alters /api/*, /account/*, /collection/*, or Next.js internals.
  if (!isExcludedFromRedirectCheck(pathname)) {
    const redirect = await resolveRedirect(pathname);
    if (redirect) {
      const destination = new URL(redirect.toPath, request.url);
      return NextResponse.redirect(destination, { status: redirect.status });
    }
  }

  // ─── Webhook signature check (skip auth for webhooks) ──────────
  // Razorpay webhooks need to bypass auth but the signature is
  // verified in the route handler itself.

  return response;
}

export const config = {
  matcher: [
    // Existing matchers (unchanged)
    "/account/profile/:path*",
    "/account/addresses/:path*",
    "/account/orders/:path*",
    "/account/wishlist/:path*",
    "/collection/:slug",
    // P3-09: broad matcher for managed redirects on all non-internal paths.
    // Keep static/media assets out of the proxy entirely so they cannot be
    // normalized, redirected, or delayed by redirect/auth/database logic.
    "/((?!_next/static|_next/image|_next/webpack-hmr|__nextjs|\\.well-known/|api/|dev-uploads/|media/|banner/|category/|hero/|logos/|fonts/|videos/|favicon.ico|manifest.json|robots.txt|sitemap.xml|icon.svg|apple-icon.svg|icon-192.png|apple-touch-icon.png|.*\\.(?:png|jpg|jpeg|webp|gif|svg|avif|ico|css|js|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|mov|m4v|pdf)$).*)",
  ],
};
