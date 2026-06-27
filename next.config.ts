import type { NextConfig } from "next";

const isStandaloneBuild = process.env.BUILD_STANDALONE === "true";

const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://images.unsplash.com https://plus.unsplash.com https://behold.pictures https://*.behold.pictures https://*.cdninstagram.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://photon.komoot.io https://*.tile.openstreetmap.org https://*.public.blob.vercel-storage.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "worker-src 'self' blob:",
  "report-uri /api/csp-report",
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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "behold.pictures",
      },
      {
        protocol: "https",
        hostname: "**.behold.pictures",
      },
      {
        protocol: "https",
        hostname: "**.cdninstagram.com",
      },
    ],
  },
  async headers() {
    return [
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
      // The founders page was renamed to "Our Team". Keep old links working.
      // Temporary (307) while still iterating — make permanent before launch.
      {
        source: "/founders",
        destination: "/our-team",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
