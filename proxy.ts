import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { resolveRedirect } from "@/lib/content/redirect-resolver";
import { isReservedSlug } from "@/lib/content/reserved-slugs";
import { SESSION_COOKIE, VISITOR_COOKIE } from "@/lib/analytics/identity";

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
 *   - /collection/:slug (product existence is checked before redirects)
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
  "/404",
  "/_not-found",
  "/apple-icon.svg",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon-192.png",
  "/icon.svg",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
]);

const DRAFT_MODE_COOKIE = "__prerender_bypass";

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

const roundDuration = (durationMs: number) => Math.round(durationMs * 10) / 10;

const withProxyTiming = <T extends NextResponse>(
  response: T,
  startedAt: number,
) => {
  response.headers.append(
    "Server-Timing",
    `proxy;dur=${roundDuration(performance.now() - startedAt)}`,
  );
  return response;
};

const rewriteNotFound = (request: NextRequest, startedAt: number) =>
  withProxyTiming(
    NextResponse.rewrite(new URL("/404", request.url), { status: 404 }),
    startedAt,
  );

const getPathSegments = (pathname: string) =>
  pathname.split("/").filter(Boolean);

const getCollectionProductSlug = (pathname: string): string | null => {
  const segments = getPathSegments(pathname);
  if (segments.length !== 2 || segments[0] !== "collection") {
    return null;
  }

  return segments[1] ?? null;
};

const getCmsSlugCandidate = (pathname: string): string | null => {
  const segments = getPathSegments(pathname);
  if (segments.length === 0 || isReservedSlug(segments[0])) {
    return null;
  }

  return segments.join("/");
};

const publicProductSlugExists = async (slug: string): Promise<boolean> => {
  const { productSlugExists } = await import("@/db/queries/products");
  return productSlugExists(slug, { includeDrafts: false });
};

const publishedCmsPageExists = async (slug: string): Promise<boolean> => {
  const { dbSelectPageBySlug } = await import("@/db/queries/content");
  const row = await dbSelectPageBySlug(slug);

  return Boolean(
    row && row.status === "published" && row.publishedVersionId,
  );
};

/**
 * Analytics identity cookies (ftt_sid / ftt_uid).
 *
 * First-party, pseudonymous, always essential — consent is not required
 * because these carry no cross-site data; consent only gates whether we EMIT
 * events (PostHog/GA4), not whether we hold the cookie.
 *
 * Only set on real top-level browser document navigations
 * (`sec-fetch-mode: navigate`). RSC/data subrequests and the synthetic
 * requests Next issues during static prerendering never send this header, so
 * this write never forces a prerendered page dynamic (which would surface
 * latent useSearchParams-without-Suspense errors).
 */
const SESSION_MAX_AGE = 60 * 30; // 30 min rolling
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const isProd = process.env.NODE_ENV === "production";

function ensureIdentityCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  if (request.method !== "GET") return;
  if (request.headers.get("sec-fetch-mode") !== "navigate") return;

  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };

  let visitorId = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!visitorId) visitorId = crypto.randomUUID();

  let sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) sessionId = crypto.randomUUID();

  response.cookies.set(VISITOR_COOKIE, visitorId, {
    ...cookieOpts,
    maxAge: VISITOR_MAX_AGE,
  });
  response.cookies.set(SESSION_COOKIE, sessionId, {
    ...cookieOpts,
    maxAge: SESSION_MAX_AGE,
  });
}

export async function proxy(request: NextRequest) {
  const startedAt = performance.now();
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();
  const isDraftModeRequest = request.cookies.has(DRAFT_MODE_COOKIE);

  if (isPublicAssetPath(pathname)) {
    return withProxyTiming(response, startedAt);
  }

  // ─── Analytics identity cookies (ftt_sid / ftt_uid) ─────────────
  // Set on real browser navigations so the session rolls (30 min) and the
  // visitor id persists (1 yr). Self-gates on sec-fetch-mode=navigate so it
  // never forces prerendered pages dynamic. See ensureIdentityCookies above.
  ensureIdentityCookies(request, response);

  // ─── Route Protection ───────────────────────────────────────────
  if (isProtected(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const signInUrl = new URL("/account/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", request.url);
      return withProxyTiming(NextResponse.redirect(signInUrl), startedAt);
    }
  }

  // ─── Public 404 preflight ──────────────────────────────────────
  // Missing product/CMS slugs must reach Next's not-found route before any
  // streamed app shell locks the HTTP status as 200. Draft-mode requests pass
  // through so preview flows can still resolve unpublished content in-page.
  if (!isDraftModeRequest) {
    const productSlug = getCollectionProductSlug(pathname);
    if (productSlug && !(await publicProductSlugExists(productSlug))) {
      return rewriteNotFound(request, startedAt);
    }
  }

  // ─── P3-09: Managed redirects ───────────────────────────────────
  // Additive: only runs for paths not already handled by product-404 or auth.
  // Never alters /api/*, /account/*, /collection/*, or Next.js internals.
  if (!isExcludedFromRedirectCheck(pathname)) {
    const redirect = await resolveRedirect(pathname);
    if (redirect) {
      const destination = new URL(redirect.toPath, request.url);
      return withProxyTiming(
        NextResponse.redirect(destination, { status: redirect.status }),
        startedAt,
      );
    }

    if (!isDraftModeRequest) {
      const cmsSlug = getCmsSlugCandidate(pathname);
      if (cmsSlug && !(await publishedCmsPageExists(cmsSlug))) {
        return rewriteNotFound(request, startedAt);
      }
    }
  }

  // ─── Webhook signature check (skip auth for webhooks) ──────────
  // Razorpay webhooks need to bypass auth but the signature is
  // verified in the route handler itself.

  return withProxyTiming(response, startedAt);
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
