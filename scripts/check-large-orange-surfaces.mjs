import { chromium } from "playwright";

const BASE_URL = process.env.ORANGE_SURFACE_BASE_URL ?? "http://localhost:3000";
const AREA_THRESHOLD = 80_000;
const ORANGE_REFERENCE = { r: 217, g: 133, b: 48 };
const DISTANCE_THRESHOLD = 36;

const ROUTES = [
  "/faqs",
  "/privacy-policy",
  "/shipping-policy",
  "/return-policy",
  "/packing",
  "/terms-of-service",
  "/how-it-works",
  "/our-story",
  "/founders",
];

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
  { width: 1440, height: 1000 },
];

function routeUrl(route) {
  return new URL(route, BASE_URL).toString();
}

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });

    for (const route of ROUTES) {
      await page.goto(routeUrl(route), {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      const largeOrangeSurfaces = await page.evaluate(
        ({ areaThreshold, distanceThreshold, orangeReference }) => {
          function parseRgb(value) {
            const match = /^rgba?\(([^)]+)\)$/.exec(value);
            if (!match) return null;

            const parts = match[1].split(",").map((part) => part.trim());
            if (parts.length < 3) return null;

            const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
            if (!Number.isFinite(alpha) || alpha <= 0.1) return null;

            return {
              r: Number(parts[0]),
              g: Number(parts[1]),
              b: Number(parts[2]),
              a: alpha,
            };
          }

          function colorDistance(a, b) {
            return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
          }

          return [document.documentElement, document.body, ...document.querySelectorAll("*")]
            .map((element) => {
              const style = window.getComputedStyle(element);
              const color = parseRgb(style.backgroundColor);
              if (!color) return null;

              const rect = element.getBoundingClientRect();
              const width = Math.max(0, Math.min(rect.width, window.innerWidth));
              const height = Math.max(0, Math.min(rect.height, window.innerHeight));
              const area = width * height;

              if (area < areaThreshold) return null;
              if (colorDistance(color, orangeReference) > distanceThreshold) return null;

              return {
                tagName: element.tagName.toLowerCase(),
                className:
                  typeof element.className === "string"
                    ? element.className.slice(0, 180)
                    : "",
                backgroundColor: style.backgroundColor,
                area: Math.round(area),
              };
            })
            .filter(Boolean);
        },
        {
          areaThreshold: AREA_THRESHOLD,
          distanceThreshold: DISTANCE_THRESHOLD,
          orangeReference: ORANGE_REFERENCE,
        }
      );

      if (largeOrangeSurfaces.length > 0) {
        failures.push({
          route,
          viewport: `${viewport.width}x${viewport.height}`,
          largeOrangeSurfaces,
        });
      }
    }

    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error("Large orange page surfaces detected:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("No large orange page surfaces detected.");
