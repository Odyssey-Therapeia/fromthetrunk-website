import type { NextConfig } from "next";

const isStandaloneBuild = process.env.BUILD_STANDALONE === "true";

const isVercelPublicBlobHost = (host: string) =>
  /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(host);

const configuredMediaHosts = [
  ...(process.env.FTT_MEDIA_SOURCE_HOSTS ?? "").split(","),
  process.env.FTT_MEDIA_DERIVATIVE_DESTINATION_HOST ?? "",
]
  .map((host) => host.trim().toLowerCase())
  .filter(isVercelPublicBlobHost);

const mediaHosts = Array.from(
  new Set([
    "njufw8f4mlcjsl7g.public.blob.vercel-storage.com",
    "ll1rv51y3jxrt1nr.public.blob.vercel-storage.com",
    "mgkwfyatucnr0yzo.public.blob.vercel-storage.com",
    ...configuredMediaHosts,
  ]),
);
const MEDIA_CSP_SRC = mediaHosts.map((host) => `https://${host}`).join(" ");

// Google Tag Manager + GA4 domains (consent-gated GTM loader; GA4 configured
// inside GTM). Merged into the directives below. GTM Preview / Tag Assistant
// need tagmanager.google.com + googletagmanager.com in script/frame/connect,
// and gstatic in img. No Google Ads / DoubleClick / pagead domains (no ads /
// remarketing), no wildcard `*`, no 'unsafe-eval'.
const GTM_SCRIPT_SRC =
  "https://www.googletagmanager.com https://*.googletagmanager.com https://tagmanager.google.com";
const GA_CONNECT_SRC =
  "https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://*.googletagmanager.com";
const GA_IMG_SRC =
  "https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.googletagmanager.com https://ssl.gstatic.com https://www.gstatic.com";
const GTM_FRAME_SRC =
  "https://www.googletagmanager.com https://tagmanager.google.com";

const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://checkout.razorpay.com ${GTM_SCRIPT_SRC} https://www.google-analytics.com`,
  `script-src-elem 'self' 'unsafe-inline' https://checkout.razorpay.com ${GTM_SCRIPT_SRC} https://www.google-analytics.com`,
  "style-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://tagmanager.google.com https://fonts.googleapis.com",
  `img-src 'self' data: blob: ${MEDIA_CSP_SRC} https://behold.pictures https://*.behold.pictures https://*.cdninstagram.com ${GA_IMG_SRC}`,
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://region1.google-analytics.com ${GA_CONNECT_SRC} https://photon.komoot.io https://*.tile.openstreetmap.org ${MEDIA_CSP_SRC}`,
  `frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com ${GTM_FRAME_SRC}`,
  "worker-src 'self' blob:",
  "report-uri /api/v2/security/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  ...(isStandaloneBuild ? { output: "standalone" as const } : {}),
  // Dev-only: allow the LAN "Network" URL host to reach dev resources (HMR, etc.).
  // Ignored in production builds. Add more entries if you test from other devices.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.2",
    "192.168.1.88",
    "192.168.*.*",
    "192.168.*",
  ],
  turbopack: {
    root: __dirname,
  },
  images: {
    formats: ["image/webp"],
    deviceSizes: [360, 414, 640, 768, 1080, 1280, 1600, 1920],
    imageSizes: [48, 64, 96, 128, 192, 256, 320, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    qualities: [70, 75],
    localPatterns: [
      { pathname: "/404/**", search: "" },
      { pathname: "/banner/**", search: "" },
      { pathname: "/category/**", search: "" },
      { pathname: "/footer/**", search: "" },
      { pathname: "/founder/**", search: "" },
      { pathname: "/hero/**", search: "" },
      { pathname: "/media/**", search: "" },
      { pathname: "/our-story/**", search: "" },
      { pathname: "/packaging/**", search: "" },
      { pathname: "/Blouse_size.png", search: "" },
      { pathname: "/Ftt_logo_navbar.avif", search: "" },
    ],
    remotePatterns: mediaHosts.map((hostname) =>
      ({
        protocol: "https",
        hostname,
        pathname: "/media/**",
        search: "",
      }) as const,
    ),
  },
  async headers() {
    return [
      {
        source: "/drape-room/vision/mediapipe-1.0.1/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/banner/from-the-trunk-social-v1.jpg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/founder/founders-cover-v1.webp",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/category/optimized-v1/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/video/welcoming-v2.webm",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/welcome-poster.avif",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspReportOnly,
          },
        ],
      },
      // Allow Razorpay to frame the checkout modal
      {
        source: "/checkout",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/Welcoming.mp4",
        destination: "/welcome-poster.avif",
        permanent: true,
      },
      {
        source: "/video/welcoming-v2.mp4",
        destination: "/welcome-poster.avif",
        permanent: true,
      },
      {
        source: "/seo-candidates/welcoming-1080p-crf30-muted.mp4",
        destination: "/welcome-poster.avif",
        permanent: true,
      },
      {
        source: "/Welcoming.webm",
        destination: "/video/welcoming-v2.webm",
        permanent: true,
      },
      {
        source: "/faq",
        destination: "/faqs",
        permanent: true,
      },
      {
        source: "/about",
        destination: "/our-story",
        permanent: true,
      },
      {
        source: "/stories",
        destination: "/our-story",
        permanent: true,
      },
      {
        source: "/founders",
        destination: "/our-team",
        permanent: true,
      },
      {
        source: "/privacy-policy",
        destination: "/policies/privacy-policy",
        permanent: true,
      },
      {
        source: "/terms-of-service",
        destination: "/policies/terms-of-service",
        permanent: true,
      },
      {
        source: "/shipping-policy",
        destination: "/policies/shipping-delivery-policy",
        permanent: true,
      },
      {
        source: "/return-policy",
        destination: "/policies/return-refund-policy",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
