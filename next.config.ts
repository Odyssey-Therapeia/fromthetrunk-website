import type { NextConfig } from "next";

const isStandaloneBuild = process.env.BUILD_STANDALONE === "true";

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
      // "Our Story" now lives on the founders page.
      {
        source: "/our-story",
        destination: "/founders",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
