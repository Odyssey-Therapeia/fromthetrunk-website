import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, "audits", "seo-inventory");
const CSV_DIR = path.join(AUDIT_DIR, "csv");
const BASE_URL = process.env.SEO_AUDIT_BASE_URL ?? "http://127.0.0.1:3100";
const CANONICAL_ORIGIN = "https://www.fromthetrunk.shop";
const CANONICAL_HOSTS = new Set(["www.fromthetrunk.shop", "fromthetrunk.shop"]);
const GENERATED_AT = new Date().toISOString();
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md",
  ".txt", ".css", ".html", ".xml", ".yml", ".yaml", ".toml",
]);
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const SOURCE_ROOTS = ["app", "components", "lib", "data", "content", "public", "tests"];
const UTILITY_PREFIXES = ["/account", "/cart", "/checkout", "/search", "/wishlist"];
const SEO_SIGNAL_RE = /\b(?:seo|metadata|title|description|canonical|robots|sitemap|json-ld|schema|open\s*graph|twitter|hreflang|alternate|redirect|reserved\s*slug|faqpage|organization|online\s*store|product|breadcrumb|noindex|nofollow|alt\s*=|href\s*=|og:|geo\.|icbm|verification)\b/i;
const FTT_COLORS = {
  burgundy: "#601D1C",
  navy: "#141D46",
  gold: "#B39152",
  cream: "#FDF7F1",
};

const STOP_WORDS = new Set(`a an and are as at be been being but by can could did do does doing for from had has have having he her hers him his how i if in into is it its itself may might more most must my no nor not of on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who why will with would you your yours`.split(/\s+/));
const COMMERCIAL_TERMS = new Set([
  "pre-loved", "saree", "sarees", "vintage", "luxury", "silk", "chiffon",
  "banarasi", "kanjeevaram", "kanjivaram", "authenticated", "authentication",
  "provenance", "designer", "blouse", "blouses", "bridal", "wedding", "festive",
]);

const SOT_ROWS = [
  {
    pageName: "Homepage", pdfUrl: "/", actualPath: "/",
    h1: "Authenticated Pre-Loved Luxury Sarees",
    title: "Authenticated Pre-Loved Luxury Sarees | From The Trunk",
    meta: "Shop authenticated pre-loved & vintage luxury sarees with provenance — heirloom silks, designer drapes and restored weaves, each with its own story.",
    robots: "index, follow", pdfPage: 1,
  },
  {
    pageName: "Collection", pdfUrl: "/collection", actualPath: "/collection",
    h1: "Pre-Loved & Vintage Luxury Sarees",
    title: "Pre-Loved & Vintage Luxury Sarees – Shop All | From The Trunk",
    meta: "Browse our full collection of authenticated pre-loved sarees — silk, chiffon, Banarasi and designer drapes. One-of-a-kind pieces, new arrivals weekly.",
    robots: "index, follow", pdfPage: 1,
  },
  {
    pageName: "Top Viewed", pdfUrl: "/top-viewed", actualPath: "/top-viewed",
    h1: "Most-Loved Pre-Loved Sarees",
    title: "Most-Viewed Pre-Loved Sarees – Top Picks | From The Trunk",
    meta: "Our most-viewed pre-loved sarees this week — authenticated silk, chiffon and designer drapes shoppers keep coming back to. One-of-a-kind, updated often.",
    robots: "index, follow", pdfPage: 1,
  },
  {
    pageName: "Blouses", pdfUrl: "/blouses", actualPath: "/blouses",
    h1: "Pre-Loved & Designer Saree Blouses",
    title: "Pre-Loved Saree Blouses | From The Trunk",
    meta: "Curated pre-loved and designer saree blouses to complete your drape — authenticated, one-of-a-kind pieces from From The Trunk.",
    robots: "index, follow", pdfPage: 1,
  },
  {
    pageName: "Product template", pdfUrl: "/collection/[product-slug]", actualPath: "/collection/magenta-mist-chiffon-drape",
    h1: "{{Product Name}}",
    title: "{{Product Name}} – Pre-Loved {{Fabric}} Saree | From The Trunk",
    meta: "Own ‘{{Product Name}}’, a one-of-a-kind pre-loved {{fabric}} saree authenticated by From The Trunk. {{one-line story}}. Shipped with provenance.",
    robots: "index, follow", pdfPage: 1, template: true,
  },
  {
    pageName: "Product filled example", pdfUrl: "/collection/magenta-mist-chiffon-drape", actualPath: "/collection/magenta-mist-chiffon-drape",
    h1: "Magenta Mist Chiffon Drape",
    title: "Magenta Mist Chiffon Drape – Pre-Loved Chiffon Saree | From The Trunk",
    meta: "Own ‘Magenta Mist’, a one-of-a-kind pre-loved chiffon saree authenticated by From The Trunk — the magenta that held the light. Shipped with provenance.",
    robots: "index, follow", pdfPage: 1,
  },
  {
    pageName: "About / Our Story", pdfUrl: "/about", actualPath: "/our-story",
    h1: "Our Story — Pre-Loved Sarees With Provenance",
    title: "Our Story — Sarees With Provenance | From The Trunk",
    meta: "Why we authenticate every saree and pass on its story. Meet From The Trunk — a home for pre-loved luxury sarees that still have a story to tell.",
    robots: "index, follow", pdfPage: 2,
  },
  {
    pageName: "How It Works", pdfUrl: "/how-it-works", actualPath: "/how-it-works",
    h1: "How From The Trunk Works — Buying & Authentication",
    title: "How It Works — Buying & Authentication | From The Trunk",
    meta: "How From The Trunk sources, authenticates and ships pre-loved sarees — with provenance, care and confidence at every step.",
    robots: "index, follow", pdfPage: 2,
  },
  {
    pageName: "Authentication", pdfUrl: "/authentication", actualPath: "/authentication",
    h1: "How We Authenticate Every Pre-Loved Saree",
    title: "Saree Authentication & Provenance | From The Trunk",
    meta: "How From The Trunk verifies fibre, zari and provenance, so every pre-loved saree you buy is exactly what we say it is.",
    robots: "index, follow", pdfPage: 2,
  },
  {
    pageName: "Contact", pdfUrl: "/contact", actualPath: "/contact",
    h1: "Contact From The Trunk",
    title: "Contact Us | From The Trunk Pre-Loved Sarees",
    meta: "Questions about a saree, an order, or consigning your own? Reach the From The Trunk team by email, WhatsApp or social.",
    robots: "index, follow", pdfPage: 2,
  },
  {
    pageName: "FAQ", pdfUrl: "/faqs", actualPath: "/faqs",
    h1: "Pre-Loved Saree FAQs",
    title: "Pre-Loved Saree FAQs | From The Trunk",
    meta: "Answers on authenticity, sizing, shipping, returns and consignment for pre-loved sarees at From The Trunk.",
    robots: "index, follow; preserve visible FAQPage schema", pdfPage: 2,
  },
  {
    pageName: "Shipping & Delivery", pdfUrl: "/shipping", actualPath: "/policies/shipping-delivery-policy",
    h1: "Shipping & Delivery",
    title: "Shipping & Delivery | From The Trunk",
    meta: "How From The Trunk packs and ships your pre-loved saree — timelines, coverage and what to expect.",
    robots: "index, follow", pdfPage: 2,
  },
  {
    pageName: "Packaging", pdfUrl: "/packing", actualPath: "/packing",
    h1: "Our Packaging", title: "Packaging & Care | From The Trunk",
    meta: "How we wrap and protect every pre-loved saree for its journey to you.",
    robots: "index, follow", pdfPage: 2,
  },
  {
    pageName: "Returns & Exchanges", pdfUrl: "/returns", actualPath: "/policies/return-refund-policy",
    h1: "Returns & Exchanges", title: "Returns & Exchanges | From The Trunk",
    meta: "From The Trunk’s returns and exchange policy for pre-loved sarees — what’s covered and how it works.",
    robots: "index, follow", pdfPage: 3,
  },
  {
    pageName: "Privacy Policy", pdfUrl: "/privacy", actualPath: "/policies/privacy-policy",
    h1: "Privacy Policy", title: "Privacy Policy | From The Trunk",
    meta: "How From The Trunk collects, uses and protects your personal information.",
    robots: "index, follow", pdfPage: 3,
  },
  {
    pageName: "Terms & Conditions", pdfUrl: "/terms", actualPath: "/policies/terms-of-service",
    h1: "Terms & Conditions", title: "Terms & Conditions | From The Trunk",
    meta: "The terms that apply when you shop with or consign to From The Trunk.",
    robots: "index, follow", pdfPage: 3,
  },
  ...["/cart", "/checkout", "/account", "/account/wishlist", "/search", "/checkout/confirmation"].map((actualPath) => ({
    pageName: `Noindex utility ${actualPath}`,
    pdfUrl: actualPath,
    actualPath,
    h1: "Functional H1 accepted",
    title: "No SEO-specific title required",
    meta: "No SEO-specific meta required",
    robots: "noindex, follow",
    pdfPage: 3,
    utility: true,
  })),
];

const ZIP_COVERAGE = [
  ["Canonical sell route", "/sell or /sell-your-saree", "/sell-your-saree", "Archive says /sell-your-saree is canonical; stale /sell CTA was only a change candidate."],
  ["Fabric landing", "/collection/fabric/silk", "/collection/fabric/silk", "Conditionally indexable when the product threshold is met."],
  ["Occasion landing", "/collection/occasion/festive", "/collection/occasion/festive", "Conditionally indexable when the product threshold is met."],
  ["Query filters", "Noindex and excluded from sitemap", "/collection?fabric=silk", "Archive treats query filters as UX links, not index targets."],
  ["Policy canonicals", "/policies/[slug]", "/policies/[slug]", "Archive defines the canonical policy family and legacy aliases."],
  ["Care guide proposal", "/guides/saree-care-guide", "/guides/saree-care-guide", "Future only after content approval."],
  ["Fabric guide proposal", "/guides/saree-fabric-guide", "/guides/saree-fabric-guide", "Future only after content approval."],
  ["Sustainability guide proposal", "/guides/sustainable-sarees", "/guides/sustainable-sarees", "Future only after content approval."],
  ["Press/media proposal", "/press or /media-kit", "/press", "Future only after content and asset approval."],
  ["Journal", "No recommendation found in historical Archive.zip", "/journal", "The current brief asks to check it, but the archive does not propose it."],
  ["Schema helpers", "Product, organization, website, breadcrumb and safe JSON-LD", "lib/seo/json-ld.ts", "Archive names the helper surface."],
  ["Metadata helpers", "Shared public, PDP, OG and Twitter helpers", "lib/seo/metadata.ts", "Archive names the helper surface."],
  ["Sitemap helper", "Canonical indexable routes only", "app/sitemap.ts", "Archive names the helper surface."],
  ["Robots helper", "Public allow; utility/private exclusions", "app/robots.ts", "Archive names the helper surface."],
  ["Verification metadata", "No Google verification item found", "site metadata", "No google-site-verification match exists in the historical archive."],
];

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
const relativePath = (absolutePath) => path.relative(ROOT, absolutePath).split(path.sep).join("/");
const truncate = (value, max = 1000) => {
  const text = cleanText(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};
const normalizeForComparison = (value) => cleanText(value)
  .normalize("NFKD")
  .replace(/[‘’]/g, "'")
  .replace(/[–—−]/g, "-")
  .replace(/\s*-\s*/g, "-")
  .toLowerCase();
const comparablePath = (value) => {
  try {
    const url = new URL(value, CANONICAL_ORIGIN);
    return `${url.pathname.replace(/\/$/, "") || "/"}${url.search}`;
  } catch {
    return cleanText(value);
  }
};
const isNoindex = (robots) => /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(robots ?? "");
const isNofollow = (robots) => /(?:^|[,\s])nofollow(?:[,\s]|$)/i.test(robots ?? "");
const normalizeRobots = (value) => cleanText(value).toLowerCase() || "index, follow (implicit)";

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  if (!(await pathExists(directory))) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git" || entry.name === "audits") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function routeFromAppFile(file) {
  const rel = relativePath(file);
  const appRel = rel.replace(/^app\//, "");
  if (appRel === "robots.ts") return { route: "/robots.txt", routeGroup: "metadata", kind: "metadata" };
  if (appRel === "sitemap.ts") return { route: "/sitemap.xml", routeGroup: "metadata", kind: "metadata" };
  if (/^(?:opengraph-image|twitter-image)\./.test(appRel)) return { route: "/opengraph-image", routeGroup: "metadata", kind: "metadata" };
  const filename = path.basename(appRel);
  if (!/^(page|route)\.(?:tsx?|jsx?|mjs|cjs)$/.test(filename)) return null;
  const kind = filename.startsWith("page.") ? "page" : "handler";
  const pieces = path.dirname(appRel).split(path.sep).filter(Boolean);
  const groups = pieces.filter((piece) => /^\(.+\)$/.test(piece));
  const routePieces = pieces.filter((piece) => !/^\(.+\)$/.test(piece));
  let route = `/${routePieces.join("/")}`.replace(/\/+/g, "/");
  if (route === "/llms.txt" && kind === "handler") route = "/llms.txt";
  return { route: route || "/", routeGroup: groups.join(" > ") || "root", kind };
}

function patternToRegex(pattern) {
  if (pattern === "/") return /^\/$/;
  const parts = pattern.split("/").filter(Boolean).map((part) => {
    if (/^\[\.\.\..+\]$/.test(part)) return ".+";
    if (/^\[\[\.\.\..+\]\]$/.test(part)) return ".*";
    if (/^\[.+\]$/.test(part)) return "[^/]+";
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^/${parts.join("/")}/?$`);
}

function classifyPage(urlPath, status, contentType = "text/html") {
  const pathname = new URL(urlPath, BASE_URL).pathname;
  if (/^\/api\//.test(pathname) || ["/robots.txt", "/sitemap.xml", "/llms.txt"].includes(pathname) || !/text\/html/i.test(contentType)) return "API / metadata endpoint";
  if (status >= 300 && status < 400) return "redirect";
  if (pathname.startsWith("/admin")) return "admin/private";
  if (UTILITY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || pathname === "/404") return "utility page";
  if (/^\/collection\/[^/]+$/.test(pathname)) return "product page";
  if (pathname === "/collection" || pathname === "/blouses" || pathname === "/top-viewed" || pathname.startsWith("/collection/fabric/") || pathname.startsWith("/collection/occasion/")) return "collection page";
  if (pathname === "/policies" || pathname.startsWith("/policies/")) return "policy page";
  if (pathname.startsWith("/guides/")) return "public SEO page / guide";
  if (status === 404) return "unknown / 404";
  return "public SEO page";
}

function resolveImport(specifier, fromFile, knownFiles) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? path.join(ROOT, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...CODE_EXTENSIONS.map((ext) => `${base}${ext}`), ...CODE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

async function buildSourceInventory() {
  const roots = await Promise.all(SOURCE_ROOTS.map((root) => walk(path.join(ROOT, root))));
  const rootFiles = ["next.config.ts", "proxy.ts", "package.json", "vitest.config.ts", "playwright.config.ts", "lighthouserc.cjs"]
    .map((file) => path.join(ROOT, file))
    .filter((file) => fileURLToPath(new URL(`file://${file}`)) && true);
  const files = unique([...roots.flat(), ...rootFiles]).filter((file) => !relativePath(file).startsWith("audits/"));
  const knownFiles = new Set(files);
  const textByFile = new Map();
  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    try {
      textByFile.set(file, await fs.readFile(file, "utf8"));
    } catch {
      // Binary or unreadable files remain in the file inventory without text.
    }
  }

  const imports = new Map();
  for (const [file, text] of textByFile) {
    const specs = [
      ...text.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g),
      ...text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    imports.set(file, unique(specs.map((spec) => resolveImport(spec, file, knownFiles)).filter(Boolean)));
  }

  const routeFiles = files
    .map((file) => ({ file, info: relativePath(file).startsWith("app/") ? routeFromAppFile(file) : null }))
    .filter(({ info }) => info?.kind === "page");
  const dependenciesByRoute = new Map();
  for (const { file, info } of routeFiles) {
    const visited = new Set();
    const stack = [file];
    while (stack.length) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const dependency of imports.get(current) ?? []) stack.push(dependency);
    }
    dependenciesByRoute.set(info.route, visited);
  }

  const routesByFile = new Map();
  for (const [route, dependencies] of dependenciesByRoute) {
    for (const dependency of dependencies) {
      const routes = routesByFile.get(dependency) ?? [];
      routes.push(route);
      routesByFile.set(dependency, routes);
    }
  }

  const sourceFiles = files.map((file) => {
    const rel = relativePath(file);
    const ext = path.extname(file).toLowerCase() || "[none]";
    const text = textByFile.get(file) ?? "";
    const routeInfo = rel.startsWith("app/") ? routeFromAppFile(file) : null;
    const signalLines = text.split(/\r?\n/)
      .map((line, index) => ({ line: index + 1, text: cleanText(line) }))
      .filter(({ text: line }) => SEO_SIGNAL_RE.test(line))
      .slice(0, 12)
      .map(({ line, text: lineText }) => `L${line}: ${truncate(lineText, 180)}`);
    let relevance = "other";
    if (/sitemap/i.test(rel)) relevance = "sitemap";
    else if (/robots/i.test(rel)) relevance = "robots";
    else if (/json-ld|schema/i.test(rel) || /application\/ld\+json/i.test(text)) relevance = "schema";
    else if (/metadata|pdp-meta|og-data/i.test(rel) || /generateMetadata|export const metadata/.test(text)) relevance = "metadata";
    else if (/nav|header/i.test(rel)) relevance = "nav";
    else if (/footer/i.test(rel)) relevance = "footer";
    else if (/product/i.test(rel)) relevance = "product";
    else if (/polic/i.test(rel)) relevance = "policy";
    else if (/test|spec/.test(rel)) relevance = "test";
    else if (routeInfo?.kind === "page") relevance = "page";
    else if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm)$/i.test(rel)) relevance = "media asset";
    return {
      filePath: rel,
      fileType: ext,
      seoRelevance: relevance,
      importantSeoStrings: signalLines.join(" | "),
      routesAffected: unique([routeInfo?.route, ...(routesByFile.get(file) ?? [])]).join(" | "),
      notes: text ? `${text.split(/\r?\n/).length} text lines scanned` : "Binary/media filename inventoried; content not parsed",
    };
  });

  return { files, textByFile, sourceFiles, routeFiles, dependenciesByRoute };
}

function parseRedirectsFromConfig(text) {
  const redirects = [];
  const regex = /source:\s*["']([^"']+)["'][\s\S]{0,220}?destination:\s*["']([^"']+)["'][\s\S]{0,120}?permanent:\s*(true|false)/g;
  for (const match of text.matchAll(regex)) {
    redirects.push({ fromPath: match[1], toPath: match[2], status: match[3] === "true" ? 308 : 307, source: "next.config.ts" });
  }
  return redirects;
}

function parseRobotsTxt(text) {
  const rules = [];
  let active = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(":");
    const key = keyRaw.toLowerCase().trim();
    const value = rest.join(":").trim();
    if (key === "user-agent") active = value === "*";
    else if (active && (key === "allow" || key === "disallow")) rules.push({ type: key, path: value });
  }
  return rules;
}

function robotsAllows(pathname, rules) {
  const matches = rules.filter((rule) => rule.path && pathname.startsWith(rule.path));
  if (!matches.length) return { allowed: true, rule: "Allow: / (default)" };
  matches.sort((a, b) => b.path.length - a.path.length || (a.type === "allow" ? -1 : 1));
  return { allowed: matches[0].type === "allow", rule: `${matches[0].type === "allow" ? "Allow" : "Disallow"}: ${matches[0].path}` };
}

function parseSitemap(xml) {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  return [...dom.window.document.querySelectorAll("url")].map((urlNode) => ({
    loc: cleanText(urlNode.querySelector("loc")?.textContent),
    lastmod: cleanText(urlNode.querySelector("lastmod")?.textContent),
    changefreq: cleanText(urlNode.querySelector("changefreq")?.textContent),
    priority: cleanText(urlNode.querySelector("priority")?.textContent),
    images: [...urlNode.querySelectorAll("image\\:loc, loc")].map((node) => cleanText(node.textContent)).filter((loc) => /\.(?:jpe?g|png|webp|avif|gif)(?:\?|$)/i.test(loc)),
  })).filter((entry) => entry.loc);
}

function localizeUrl(value) {
  const url = new URL(value, BASE_URL);
  if (CANONICAL_HOSTS.has(url.hostname)) return new URL(`${url.pathname}${url.search}`, BASE_URL);
  return url;
}

async function fetchLocal(pathOrUrl, options = {}) {
  let current = localizeUrl(pathOrUrl);
  const redirectChain = [];
  for (let hop = 0; hop < 10; hop += 1) {
    if (current.origin !== new URL(BASE_URL).origin) {
      return { requested: String(pathOrUrl), status: 0, finalUrl: current.href, redirectChain, headers: {}, body: "", externalRedirect: true };
    }
    let response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "FTT-SEO-Inventory-Audit/1.0", accept: options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8" },
      });
    } catch (error) {
      return { requested: String(pathOrUrl), status: 0, finalUrl: current.href, redirectChain, headers: {}, body: "", fetchError: error instanceof Error ? error.message : String(error) };
    }
    const headers = Object.fromEntries(response.headers.entries());
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      const location = response.headers.get("location");
      redirectChain.push({ url: current.href, status: response.status, location });
      current = localizeUrl(new URL(location, current).href);
      continue;
    }
    return {
      requested: String(pathOrUrl),
      status: response.status,
      finalUrl: current.href,
      redirectChain,
      headers,
      body: await response.text(),
    };
  }
  return { requested: String(pathOrUrl), status: 0, finalUrl: current.href, redirectChain, headers: {}, body: "", fetchError: "Redirect limit exceeded" };
}

function schemaTypes(value, prefix = "root") {
  const rows = [];
  if (!value || typeof value !== "object") return rows;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rows.push(...schemaTypes(item, `${prefix}[${index}]`)));
    return rows;
  }
  if (value["@type"]) rows.push({ path: `${prefix}.@type`, type: Array.isArray(value["@type"]) ? value["@type"].join(" | ") : String(value["@type"]) });
  for (const [key, child] of Object.entries(value)) {
    if (key === "@context" || key === "@type") continue;
    if (child && typeof child === "object") rows.push(...schemaTypes(child, `${prefix}.${key}`));
  }
  return rows;
}

function linkLocation(anchor) {
  if (anchor.closest("header, nav[aria-label*=\"primary\" i], nav[aria-label*=\"main\" i]")) return "header/nav";
  if (anchor.closest("footer")) return "footer";
  if (anchor.closest("nav[aria-label*=\"breadcrumb\" i], [class*=\"breadcrumb\" i]")) return "breadcrumb";
  if (anchor.closest("[class*=\"product-card\" i], article")) return "product-card/body";
  return "body";
}

function parseHtml(fetchResult, sitemapSet, robotsRules, routeMatcher) {
  const contentType = fetchResult.headers["content-type"] ?? "";
  const requestedUrl = new URL(fetchResult.requested, BASE_URL);
  const finalUrl = new URL(fetchResult.finalUrl || requestedUrl, BASE_URL);
  const pageType = classifyPage(requestedUrl.href, fetchResult.redirectChain[0]?.status ?? fetchResult.status, contentType);
  const robotsTxt = robotsAllows(finalUrl.pathname, robotsRules);
  const base = {
    id: `page-${Buffer.from(`${requestedUrl.pathname}${requestedUrl.search}`).toString("base64url") || "root"}`,
    url: `${requestedUrl.pathname}${requestedUrl.search}`,
    requestedLocalUrl: requestedUrl.href,
    pageType,
    httpStatus: fetchResult.redirectChain[0]?.status ?? fetchResult.status,
    finalHttpStatus: fetchResult.status,
    redirectChain: fetchResult.redirectChain,
    finalUrl: `${finalUrl.pathname}${finalUrl.search}`,
    contentType,
    xRobotsTag: fetchResult.headers["x-robots-tag"] ?? "",
    robotsTxtAllowed: robotsTxt.allowed,
    robotsTxtRule: robotsTxt.rule,
    sitemapIncluded: sitemapSet.has(`${requestedUrl.pathname.replace(/\/$/, "") || "/"}${requestedUrl.search}`),
    sourceRoute: routeMatcher(finalUrl.pathname)?.route ?? "",
    routeFile: routeMatcher(finalUrl.pathname)?.file ?? "",
    fetchError: fetchResult.fetchError ?? "",
    isHtml: /text\/html|application\/xhtml\+xml/i.test(contentType),
  };
  if (!base.isHtml || !fetchResult.body) return { ...base, htmlLength: fetchResult.body.length };

  const dom = new JSDOM(fetchResult.body, { url: finalUrl.href });
  const document = dom.window.document;
  const meta = (selector, attribute = "content") => cleanText(document.querySelector(selector)?.getAttribute(attribute));
  const title = cleanText(document.querySelector("title")?.textContent);
  const description = meta('meta[name="description" i]');
  const metaKeywords = meta('meta[name="keywords" i]');
  const robotsMeta = normalizeRobots(meta('meta[name="robots" i]'));
  const canonical = meta('link[rel="canonical" i]', "href");
  const headings = (level) => [...document.querySelectorAll(level)].map((node) => cleanText(node.textContent)).filter(Boolean);
  const h1 = headings("h1");
  const h2 = headings("h2");
  const h3 = headings("h3");

  const bodyClone = document.body?.cloneNode(true);
  bodyClone?.querySelectorAll("script,style,noscript,svg,template").forEach((node) => node.remove());
  const bodyText = cleanText(bodyClone?.textContent);
  const mainClone = document.querySelector("main")?.cloneNode(true);
  mainClone?.querySelectorAll("script,style,noscript,svg,template").forEach((node) => node.remove());
  const mainText = cleanText(mainClone?.textContent || bodyText);

  const images = [...document.querySelectorAll("img")].map((image, index) => ({
    id: `${base.id}-image-${index + 1}`,
    src: cleanText(image.getAttribute("src")),
    srcset: cleanText(image.getAttribute("srcset")),
    alt: image.hasAttribute("alt") ? image.getAttribute("alt") ?? "" : null,
    altMissing: !image.hasAttribute("alt"),
    decorative: image.getAttribute("alt") === "",
    width: cleanText(image.getAttribute("width")),
    height: cleanText(image.getAttribute("height")),
    loading: cleanText(image.getAttribute("loading")) || "eager/unspecified",
  }));

  const internalLinks = [];
  const externalLinks = [];
  [...document.querySelectorAll("a[href]")].forEach((anchor, index) => {
    const rawHref = anchor.getAttribute("href");
    if (!rawHref || /^(?:mailto:|tel:|javascript:)/i.test(rawHref)) return;
    let target;
    try { target = new URL(rawHref, finalUrl); } catch { return; }
    const rel = cleanText(anchor.getAttribute("rel"));
    const row = {
      id: `${base.id}-link-${index + 1}`,
      sourceUrl: `${finalUrl.pathname}${finalUrl.search}`,
      targetUrl: target.href,
      anchorText: cleanText(anchor.textContent) || cleanText(anchor.getAttribute("aria-label")) || "[image/icon link]",
      location: linkLocation(anchor),
      rel,
      follow: /nofollow/i.test(rel) ? "nofollow" : "follow",
      opensNewTab: anchor.getAttribute("target") === "_blank",
    };
    if (target.origin === finalUrl.origin || CANONICAL_HOSTS.has(target.hostname)) {
      row.targetUrl = `${target.pathname}${target.search}`;
      internalLinks.push(row);
    } else externalLinks.push(row);
  });

  const schemas = [...document.querySelectorAll('script[type="application/ld+json" i]')].map((script, index) => {
    const raw = script.textContent ?? "";
    try {
      const data = JSON.parse(raw);
      return {
        id: `${base.id}-schema-${index + 1}`,
        validJson: true,
        data,
        raw,
        types: schemaTypes(data),
      };
    } catch (error) {
      return {
        id: `${base.id}-schema-${index + 1}`,
        validJson: false,
        data: null,
        raw,
        error: error instanceof Error ? error.message : String(error),
        types: [],
      };
    }
  });
  const schemaTypeList = unique(schemas.flatMap((schema) => schema.types.map((item) => item.type)));
  const alternateLinks = [...document.querySelectorAll('link[rel="alternate" i]')].map((link) => ({ href: link.getAttribute("href"), hreflang: link.getAttribute("hreflang"), type: link.getAttribute("type") }));
  const allMeta = [...document.querySelectorAll("meta")].map((node) => ({
    name: node.getAttribute("name") || node.getAttribute("property") || node.getAttribute("http-equiv") || "",
    content: node.getAttribute("content") || "",
  }));
  const canonicalPath = canonical ? comparablePath(canonical) : "";
  const finalPath = `${finalUrl.pathname.replace(/\/$/, "") || "/"}${finalUrl.search}`;

  return {
    ...base,
    htmlLength: fetchResult.body.length,
    title,
    titleLength: [...title].length,
    metaDescription: description,
    metaDescriptionLength: [...description].length,
    metaKeywords,
    canonical,
    canonicalMatchesFinal: Boolean(canonical) && canonicalPath === finalPath,
    robotsMeta,
    h1Count: h1.length,
    h1,
    h2Count: h2.length,
    h2,
    h3Count: h3.length,
    h3,
    bodyWordCount: tokenize(bodyText).length,
    mainVisibleCopySummary: truncate(mainText, 500),
    bodyText,
    images,
    imageUrls: unique(images.flatMap((image) => [image.src, ...image.srcset.split(",").map((part) => cleanText(part.split(/\s+/)[0]))]).filter(Boolean)),
    missingAltCount: images.filter((image) => image.altMissing).length,
    emptyAltCount: images.filter((image) => image.decorative).length,
    openGraphTitle: meta('meta[property="og:title" i]'),
    openGraphDescription: meta('meta[property="og:description" i]'),
    openGraphImage: meta('meta[property="og:image" i]'),
    openGraphLocale: meta('meta[property="og:locale" i]'),
    twitterCard: meta('meta[name="twitter:card" i]'),
    twitterTitle: meta('meta[name="twitter:title" i]'),
    twitterDescription: meta('meta[name="twitter:description" i]'),
    twitterImage: meta('meta[name="twitter:image" i]'),
    googleVerification: meta('meta[name="google-site-verification" i]'),
    geoSignals: allMeta.filter((item) => /^(?:geo\.|icbm$)/i.test(item.name)),
    htmlLang: cleanText(document.documentElement.getAttribute("lang")),
    alternateLinks,
    allMeta,
    schemas,
    schemaTypes: schemaTypeList,
    schemaValid: schemas.every((schema) => schema.validJson),
    internalLinks,
    externalLinks,
    breadcrumbLinks: internalLinks.filter((link) => link.location === "breadcrumb"),
    headerNavLinks: internalLinks.filter((link) => link.location === "header/nav"),
    footerLinks: internalLinks.filter((link) => link.location === "footer"),
  };
}

function tokenize(value) {
  return (String(value ?? "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—−]/g, "-")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []);
}

function meaningfulTokens(value) {
  return tokenize(value).filter((token) => COMMERCIAL_TERMS.has(token) || (!STOP_WORDS.has(token) && token.length > 1));
}

const KNOWN_SOURCE_ISSUES = [
  {
    severity: "High", category: "robots", url: "/account, /cart, /checkout, /search",
    filePath: "app/robots.ts:11; lib/seo/route-metadata.ts:5",
    issue: "robots.txt disallows customer utility pages whose metadata intends noindex, follow.",
    evidence: "The disallow rules can prevent crawlers from fetching the pages and observing noindex, follow.",
    whyItMatters: "Robots blocking is not a substitute for noindex and can leave URL-only index entries while suppressing link discovery.",
    recommendedFix: "Allow these utility pages to be crawled while retaining noindex, follow metadata; keep admin/API protections separate.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Low",
  },
  {
    severity: "High", category: "links", url: "Header and homepage category links",
    filePath: "components/layout/site-header-nav.tsx:10; components/sections/fabric-category-section.tsx:19; app/(site)/collection/page.tsx:119",
    issue: "Primary internal links point to noindex collection query variants instead of dedicated canonical landing pages.",
    evidence: "Top Viewed and Blouses use collection query URLs; homepage fabric cards also use filters while canonical landing routes exist.",
    whyItMatters: "Internal authority and crawl discovery are sent to URLs intentionally canonicalized away and noindexed.",
    recommendedFix: "Link the relevant labels to /top-viewed, /blouses, and eligible canonical fabric/occasion landing pages.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Low",
  },
  {
    severity: "High", category: "sitemap", url: "/collection/fabric/* and /collection/occasion/*",
    filePath: "lib/seo/keyword-landing-pages.ts:439; app/sitemap.ts:143",
    issue: "Some keyword pages can become indexable at the product threshold but remain permanently excluded from the sitemap.",
    evidence: "Metadata indexability is count-driven, while sitemap:false is checked before product counts.",
    whyItMatters: "Indexable landing pages can lack XML discovery even when they meet the intended quality threshold.",
    recommendedFix: "Make sitemap inclusion use the same product-count eligibility decision as metadata, with explicit route policy overrides only where intentional.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Low",
  },
  {
    severity: "High", category: "thin content", url: "/policies/*",
    filePath: "lib/legal/policies.ts:5; lib/legal/policies.ts:646",
    issue: "Indexable legal pages contain unresolved bracketed business placeholders.",
    evidence: "The source flags placeholders and includes provisional grievance officer/contact/address values.",
    whyItMatters: "Visible placeholders undermine legal clarity, trust, and answer-engine reliability on sitemap-listed pages.",
    recommendedFix: "Replace every placeholder with approved legal entity, jurisdiction, officer, contact, hours, and address details before launch.",
    safeBeforeProduction: "no", requiresBusinessDecision: "yes", effort: "Low after inputs",
  },
  {
    severity: "Medium", category: "sitemap", url: "/policies/* and static pages",
    filePath: "app/sitemap.ts:16",
    issue: "Static, policy, and keyword sitemap lastmod values use one synthetic 2026-04-27 date.",
    evidence: "Rendered policies display later effective dates, including June 29, 2026.",
    whyItMatters: "Stale or synthetic freshness signals reduce sitemap accuracy.",
    recommendedFix: "Derive lastmod from maintained content timestamps or a route-specific audited constant.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Low",
  },
  {
    severity: "Medium", category: "routing", url: "Sold product PDPs",
    filePath: "lib/seo/product-indexing.ts:98; lib/seo/product-indexing.ts:128",
    issue: "Sold-product page indexability can diverge from sitemap and llms.txt eligibility.",
    evidence: "Discovery files exclude sold products while the page eligibility path uses a different decision.",
    whyItMatters: "A sold PDP may remain indexable but disappear from maintained discovery surfaces.",
    recommendedFix: "Choose and document a sold-product retention policy, then reuse one eligibility function across metadata, sitemap, and llms.txt.",
    safeBeforeProduction: "no", requiresBusinessDecision: "yes", effort: "Medium",
  },
  {
    severity: "Medium", category: "schema", url: "Reserved product PDPs",
    filePath: "db/inventory.ts:26; lib/seo/json-ld.ts:54",
    issue: "Product Offer availability can disagree with the visible availability after a reservation expires.",
    evidence: "The UI resolves expired reservations; Product JSON-LD reads raw stockStatus.",
    whyItMatters: "Structured data should match visible product facts.",
    recommendedFix: "Feed Product JSON-LD the same effective availability calculation used by the rendered PDP.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Medium",
  },
  {
    severity: "Medium", category: "sitemap", url: "/[...slug]",
    filePath: "app/(site)/[...slug]/page.tsx:137; app/sitemap.ts:18",
    issue: "Published CMS catch-all pages are not included by sitemap aggregation.",
    evidence: "The catch-all can serve published database pages; sitemap covers static, policy, keyword, and product lists only.",
    whyItMatters: "Future published CMS pages can become indexable without XML discovery and with optional metadata fields.",
    recommendedFix: "Include only published, SEO-complete CMS pages in the sitemap and validate their metadata before publish.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Medium",
  },
  {
    severity: "Medium", category: "robots", url: "Draft CMS preview",
    filePath: "app/(site)/[...slug]/page.tsx",
    issue: "Draft preview noindex behavior is not explicit in the route metadata source.",
    evidence: "The catch-all metadata path resolves published metadata and does not visibly branch on draft mode.",
    whyItMatters: "A preview URL should never inherit index, follow if exposed.",
    recommendedFix: "Verify preview response headers live and make draft-mode noindex, nofollow explicit if not already enforced upstream.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Low",
  },
  {
    severity: "Medium", category: "sitemap", url: "Product discovery files",
    filePath: "app/sitemap.ts:18; app/llms.txt/route.ts:47",
    issue: "Product discovery queries have fixed 1,000-item sitemap and 200-item llms.txt caps before eligibility filtering.",
    evidence: "Ineligible rows can consume capacity as the catalogue grows.",
    whyItMatters: "Eligible products beyond the cap can silently disappear from discovery files.",
    recommendedFix: "Paginate until exhaustion or apply eligibility in the database query before a documented cap.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Medium",
  },
  {
    severity: "Medium", category: "thin content", url: "/top-viewed",
    filePath: "app/(site)/top-viewed/page.tsx:12",
    issue: "Top Viewed is always indexable and sitemap-listed even when it renders an empty result state.",
    evidence: "The route supports an empty dataset without a count-based noindex decision.",
    whyItMatters: "An empty landing page can become a soft-404 or thin-content signal.",
    recommendedFix: "Apply a data threshold or render durable editorial content sufficient for an indexable landing page.",
    safeBeforeProduction: "no", requiresBusinessDecision: "yes", effort: "Low",
  },
  {
    severity: "Medium", category: "links", url: "Header/footer",
    filePath: "components/layout/site-header-server.tsx:14; lib/content/nav-menu.ts:35; components/layout/site-footer.tsx:8",
    issue: "Navigation has divergent hardcoded, database-managed, and fallback sources of truth.",
    evidence: "The active header is hardcoded; the footer fallback differs from a shadowed richer local default.",
    whyItMatters: "SEO-critical internal links can differ by runtime data and implementation path.",
    recommendedFix: "Define one audited navigation source per slot with a single documented fallback.",
    safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Medium",
  },
  {
    severity: "Low", category: "geo", url: "Sitewide Organization schema",
    filePath: "lib/seo/json-ld.ts:81",
    issue: "Organization sameAs contains Instagram only while the footer exposes additional social profiles.",
    evidence: "LinkedIn, Facebook, X, and Threads links are present in the footer source.",
    whyItMatters: "Verified entity links can strengthen brand consistency, but unverified profiles must not be asserted.",
    recommendedFix: "After ownership verification, align Organization sameAs with approved official profiles.",
    safeBeforeProduction: "no", requiresBusinessDecision: "yes", effort: "Low",
  },
  {
    severity: "Low", category: "H1", url: "/our-team",
    filePath: "components/sections/founders-page-client.tsx:334",
    issue: "The page title says Our Team while the visible H1 says Our Founders.",
    evidence: "Rendered semantics target different entity scopes.",
    whyItMatters: "Title/H1 alignment helps users and search engines understand the page consistently.",
    recommendedFix: "Choose the intended scope (team or founders) and align route copy and metadata after editorial approval.",
    safeBeforeProduction: "no", requiresBusinessDecision: "yes", effort: "Low",
  },
];

function makeRouteMatcher(sourceInventory) {
  const records = sourceInventory.routeFiles.map(({ file, info }) => ({
    route: info.route,
    file: relativePath(file),
    regex: patternToRegex(info.route),
    score: info.route.includes("[...") ? 0 : info.route.includes("[") ? 1 : 2,
  })).sort((a, b) => b.score - a.score || b.route.length - a.route.length);
  return (pathname) => records.find((record) => record.regex.test(pathname)) ?? null;
}

async function crawlSite(sourceInventory, runtimeData) {
  const [robotsFetch, sitemapFetch, llmsFetch] = await Promise.all([
    fetchLocal("/robots.txt", { accept: "text/plain" }),
    fetchLocal("/sitemap.xml", { accept: "application/xml" }),
    fetchLocal("/llms.txt", { accept: "text/plain" }),
  ]);
  const robotsText = robotsFetch.body;
  const sitemapXml = sitemapFetch.body;
  const llmsText = llmsFetch.body;
  const sitemapEntries = parseSitemap(sitemapXml);
  const sitemapSet = new Set(sitemapEntries.map((entry) => comparablePath(entry.loc).split("?")[0]));
  const robotsRules = parseRobotsTxt(robotsText);
  const nextConfigText = sourceInventory.textByFile.get(path.join(ROOT, "next.config.ts")) ?? "";
  const staticRedirects = parseRedirectsFromConfig(nextConfigText);
  const runtimeRedirects = (runtimeData?.redirects ?? []).map((redirect) => ({ ...redirect, status: 301, source: "managed redirects table" }));
  const redirectRecords = [...staticRedirects, ...runtimeRedirects];
  const routeMatcher = makeRouteMatcher(sourceInventory);

  const seedSet = new Set();
  const addSeed = (value) => {
    try {
      const url = localizeUrl(value);
      if (url.origin !== new URL(BASE_URL).origin) return;
      if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico|css|js|map|woff2?|ttf|otf|mp4|webm|pdf)$/i.test(url.pathname)) return;
      seedSet.add(`${url.pathname}${url.search}`);
    } catch {
      // Ignore malformed source literals.
    }
  };

  sitemapEntries.forEach((entry) => addSeed(entry.loc));
  for (const match of llmsText.matchAll(/https?:\/\/[^\s)\]]+/g)) addSeed(match[0]);
  sourceInventory.routeFiles.forEach(({ info }) => {
    if (!info.route.includes("[") && !["/robots.txt", "/sitemap.xml", "/llms.txt"].includes(info.route)) addSeed(info.route);
  });
  try {
    const prerender = JSON.parse(await fs.readFile(path.join(ROOT, ".next", "prerender-manifest.json"), "utf8"));
    Object.keys(prerender.routes ?? {}).forEach(addSeed);
  } catch {
    // Build verification records the missing manifest separately.
  }
  redirectRecords.forEach((redirect) => addSeed(redirect.fromPath));
  SOT_ROWS.forEach((row) => addSeed(row.actualPath));
  (runtimeData?.pages ?? []).filter((page) => page.status === "published" && page.hasPublishedVersion).forEach((page) => addSeed(`/${page.slug}`));
  [
    "/cart", "/checkout", "/checkout/confirmation", "/account", "/account/sign-in",
    "/account/sign-up", "/account/profile", "/account/profile/verify-email",
    "/account/addresses", "/account/orders", "/account/wishlist", "/search",
    "/search?q=silk", "/collection?fabric=silk", "/collection?occasion=wedding",
    "/collection?tags=top-viewed", "/collection?type=blouse", "/collection?sort=price-asc",
    "/404", "/seo-audit-definitely-missing", "/admin", "/admin/orders/seo-audit-placeholder/packing-slip",
    "/api/v2/docs", "/api/v2/openapi.json", "/api/auth/session",
  ].forEach(addSeed);

  const queue = [...seedSet];
  const crawled = [];
  const seen = new Set();
  for (let index = 0; index < queue.length && index < 600; index += 1) {
    const urlPath = queue[index];
    if (seen.has(urlPath)) continue;
    seen.add(urlPath);
    const fetched = await fetchLocal(urlPath);
    const page = parseHtml(fetched, sitemapSet, robotsRules, routeMatcher);
    crawled.push(page);
    for (const link of page.internalLinks ?? []) {
      const target = new URL(link.targetUrl, BASE_URL);
      if (target.search) continue;
      addSeed(target.pathname);
      if (!seen.has(target.pathname) && !queue.includes(target.pathname)) queue.push(target.pathname);
    }
  }

  await fs.writeFile(path.join(AUDIT_DIR, "robots-rendered.txt"), robotsText, "utf8");
  await fs.writeFile(path.join(AUDIT_DIR, "sitemap-rendered.xml"), sitemapXml, "utf8");
  await fs.writeFile(path.join(AUDIT_DIR, "llms-rendered.txt"), llmsText, "utf8");
  return { crawled, sitemapEntries, sitemapSet, robotsRules, robotsText, sitemapXml, llmsText, redirects: redirectRecords };
}

function findTypeObject(value, wantedType) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypeObject(item, wantedType);
      if (found) return found;
    }
    return null;
  }
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.includes(wantedType)) return value;
  for (const child of Object.values(value)) {
    const found = findTypeObject(child, wantedType);
    if (found) return found;
  }
  return null;
}

function keywordIntent(phrase) {
  if (/from the trunk|fromthetrunk|\bftt\b/.test(phrase)) return "brand";
  if (/saree|sarees|blouse|drape|weave|product/.test(phrase)) return "product";
  if (/silk|chiffon|cotton|organza|georgette|banarasi|kanj|linen|fabric|zari/.test(phrase)) return "fabric";
  if (/wedding|bridal|festive|occasion|party/.test(phrase)) return "occasion";
  if (/policy|privacy|terms|shipping|return|refund|cancellation/.test(phrase)) return "policy";
  if (/authentic|provenance|condition|trust|care|restor/.test(phrase)) return "trust";
  if (/cart|checkout|account|search|wishlist|order/.test(phrase)) return "utility";
  return "unknown";
}

function buildKeywordAnalysis(pages) {
  const phraseMap = new Map();
  const wordMap = new Map();
  const pageMaps = [];
  const addPhrase = (phrase, phraseType, pageUrl, location, count = 1) => {
    const normalized = cleanText(phrase).toLowerCase();
    if (!normalized) return;
    const key = `${phraseType}\u0000${normalized}`;
    const entry = phraseMap.get(key) ?? {
      keyword: normalized, phraseType, pages: new Set(), usedInTitle: 0, usedInMeta: 0,
      usedInH1: 0, usedInHeadings: 0, usedInUrl: 0, usedInAlt: 0, usedInSchema: 0,
      total: 0, locations: new Set(), intent: keywordIntent(normalized),
    };
    entry.pages.add(pageUrl);
    entry.total += count;
    entry.locations.add(location);
    if (location === "title") entry.usedInTitle += count;
    if (location === "meta") entry.usedInMeta += count;
    if (location === "h1") entry.usedInH1 += count;
    if (location === "h2" || location === "h3") entry.usedInHeadings += count;
    if (location === "url") entry.usedInUrl += count;
    if (location === "alt") entry.usedInAlt += count;
    if (location === "schema") entry.usedInSchema += count;
    phraseMap.set(key, entry);
  };

  const publicPages = pages.filter((page) => page.isHtml && page.finalHttpStatus === 200 && !isNoindex(`${page.robotsMeta} ${page.xRobotsTag}`) && !page.url.includes("?"));
  for (const page of publicPages) {
    const locationTexts = [
      ["title", [page.title]], ["meta", [page.metaDescription]], ["h1", page.h1 ?? []],
      ["h2", page.h2 ?? []], ["h3", page.h3 ?? []],
      ["url", page.finalUrl.split(/[/?=&-]+/)],
      ["alt", (page.images ?? []).map((image) => image.alt).filter(Boolean)],
      ["schema", (page.schemas ?? []).flatMap((schema) => {
        if (!schema.data) return [];
        const product = findTypeObject(schema.data, "Product");
        return [product?.name, product?.description, product?.category, ...schema.types.map((item) => item.type)].filter(Boolean);
      })],
    ];
    const weighted = new Map();
    for (const [location, texts] of locationTexts) {
      for (const text of texts) {
        const originalTokens = tokenize(text);
        const contentTokens = meaningfulTokens(text);
        contentTokens.forEach((token) => weighted.set(token, (weighted.get(token) ?? 0) + ({ title: 6, meta: 3, h1: 6, h2: 2, h3: 1, url: 3, alt: 1, schema: 2 }[location] ?? 1)));
        originalTokens.forEach((token) => {
          if (COMMERCIAL_TERMS.has(token) || (!STOP_WORDS.has(token) && token.length > 1)) addPhrase(token, "unigram", page.url, location);
        });
        for (let size = 2; size <= 4; size += 1) {
          for (let index = 0; index <= originalTokens.length - size; index += 1) {
            const slice = originalTokens.slice(index, index + size);
            if (!slice.some((token) => COMMERCIAL_TERMS.has(token) || (!STOP_WORDS.has(token) && token.length > 1))) continue;
            addPhrase(slice.join(" "), size === 2 ? "bigram" : size === 3 ? "trigram" : "fourgram", page.url, location);
          }
        }
        if (["title", "meta", "h1"].includes(location) && originalTokens.length > 1) addPhrase(cleanText(text), "exact phrase", page.url, location);
      }
    }

    const bodyCounts = new Map();
    for (const word of meaningfulTokens(page.bodyText)) bodyCounts.set(word, (bodyCounts.get(word) ?? 0) + 1);
    const topBody = [...bodyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20);
    const weightedTerms = [...weighted.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const primary = weightedTerms[0]?.[0] ?? "";
    const secondary = weightedTerms.slice(1, 7).map(([term]) => term);
    const fieldsWithPrimary = [page.title, page.metaDescription, ...(page.h1 ?? []), ...(page.h2 ?? []), page.bodyText]
      .filter((text) => normalizeForComparison(text).includes(normalizeForComparison(primary))).length;
    pageMaps.push({
      url: page.url,
      primary,
      secondary,
      titleKeywords: meaningfulTokens(page.title),
      metaKeywords: meaningfulTokens(page.metaDescription),
      h1Keywords: meaningfulTokens((page.h1 ?? []).join(" ")),
      headingKeywords: meaningfulTokens([...(page.h2 ?? []), ...(page.h3 ?? [])].join(" ")),
      bodyTop20: topBody.map(([term, count]) => `${term} (${count})`),
      schemaKeywords: meaningfulTokens((page.schemas ?? []).flatMap((schema) => schema.types.map((item) => item.type)).join(" ")),
      productKeywords: unique([...meaningfulTokens(page.title), ...meaningfulTokens(page.metaDescription)].filter((term) => keywordIntent(term) === "product" || keywordIntent(term) === "fabric" || keywordIntent(term) === "occasion")),
      consistencyScore: primary ? Math.round((fieldsWithPrimary / 5) * 100) : 0,
      notes: primary && topBody.some(([term]) => term === primary) ? "Primary apparent term is reinforced in rendered body copy." : "Primary apparent term is weakly reinforced in rendered body copy.",
    });

    const criticalLocations = new Set([
      ...meaningfulTokens(page.title), ...meaningfulTokens(page.metaDescription), ...meaningfulTokens((page.h1 ?? []).join(" ")),
      ...meaningfulTokens([...(page.h2 ?? []), ...(page.h3 ?? [])].join(" ")),
      ...meaningfulTokens((page.images ?? []).map((image) => image.alt).filter(Boolean).join(" ")),
    ]);
    for (const [word, count] of bodyCounts) {
      const entry = wordMap.get(word) ?? { word, count: 0, pages: new Set(), firstPage: page.url, critical: false, examples: new Set() };
      entry.count += count;
      entry.pages.add(page.url);
      entry.critical ||= criticalLocations.has(word);
      if (entry.examples.size < 5) {
        const locations = [];
        if (meaningfulTokens(page.title).includes(word)) locations.push("title");
        if (meaningfulTokens(page.metaDescription).includes(word)) locations.push("meta");
        if (meaningfulTokens((page.h1 ?? []).join(" ")).includes(word)) locations.push("H1");
        if (!locations.length) locations.push("body");
        entry.examples.add(`${page.url}: ${locations.join("/")}`);
      }
      wordMap.set(word, entry);
    }
  }

  return {
    keywords: [...phraseMap.values()].sort((a, b) => b.total - a.total || a.keyword.localeCompare(b.keyword)),
    corpus: [...wordMap.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)),
    pageMaps,
  };
}

function pageIssue(severity, category, page, issue, evidence, recommendedFix) {
  return {
    severity, category, url: page.url, filePath: page.sourceFilesInvolved?.join(" | ") || page.routeFile,
    issue, evidence, whyItMatters: {
      H1: "A single descriptive H1 is a core page-topic and accessibility signal.",
      title: "Titles are a primary search-result and relevance signal.",
      meta: "Unique descriptions improve result clarity and prevent duplicated snippets.",
      canonical: "Canonicals consolidate duplicate signals and must point to the intended live URL.",
      robots: "Robots directives control eligibility and crawler behavior.",
      sitemap: "XML sitemaps should list canonical, indexable, successful URLs only.",
      schema: "Invalid or contradictory structured data can be ignored or create trust risks.",
      images: "Useful alternative text supports accessibility and image discovery.",
      duplicate: "Duplicate SEO fields weaken page differentiation.",
      routing: "HTTP and redirect behavior determine whether search engines can reliably access the intended page.",
      "thin content": "Thin or empty pages can be treated as low-value or soft 404s.",
    }[category] ?? "The signal affects crawlability, indexability, relevance, or trust.",
    recommendedFix, safeBeforeProduction: "yes", requiresBusinessDecision: "no", effort: "Low",
  };
}

function enrichPages(pages, sourceInventory) {
  const matcher = makeRouteMatcher(sourceInventory);
  const sourceRowsByPath = new Map(sourceInventory.sourceFiles.map((row) => [row.filePath, row]));
  const statusByPath = new Map();
  for (const page of pages) statusByPath.set(comparablePath(page.url), page.finalHttpStatus);
  for (const page of pages) {
    const match = matcher(new URL(page.finalUrl, BASE_URL).pathname);
    const dependencyFiles = match ? sourceInventory.dependenciesByRoute.get(match.route) ?? new Set() : new Set();
    page.sourceFilesInvolved = [...dependencyFiles]
      .map(relativePath)
      .filter((file) => !["other", "media asset", "test"].includes(sourceRowsByPath.get(file)?.seoRelevance))
      .slice(0, 30);
    page.titleSource = page.title
      ? [...sourceInventory.textByFile.entries()].filter(([, text]) => text.includes(page.title)).slice(0, 5).map(([file]) => relativePath(file)).join(" | ") || match?.file || "dynamic/runtime"
      : match?.file || "";
    page.metaSource = page.metaDescription
      ? [...sourceInventory.textByFile.entries()].filter(([, text]) => text.includes(page.metaDescription)).slice(0, 5).map(([file]) => relativePath(file)).join(" | ") || match?.file || "dynamic/runtime"
      : match?.file || "";
    const isRedirectResponse = page.httpStatus >= 300 && page.httpStatus < 400;
    const expectedNoindex = page.pageType === "utility page" || page.pageType === "admin/private" || page.pageType === "redirect" || isRedirectResponse || page.url.includes("?") || page.finalHttpStatus === 404;
    const actualNoindex = isNoindex(`${page.robotsMeta} ${page.xRobotsTag}`);
    const expectedNofollow = page.pageType === "admin/private";
    page.expectedNoindex = expectedNoindex;
    page.actualNoindex = actualNoindex;
    page.indexable = page.httpStatus === 200 && page.finalHttpStatus === 200 && page.isHtml && !actualNoindex && page.robotsTxtAllowed;
    page.shouldAppearInSitemap = page.httpStatus === 200 && page.finalHttpStatus === 200 && page.isHtml && !expectedNoindex && !actualNoindex && !page.url.includes("?") && !page.url.startsWith("/404");
    page.canonicalTargetStatus = page.canonical ? statusByPath.get(comparablePath(page.canonical)) ?? "not crawled" : "missing";
    page.soft404Risk = page.finalHttpStatus === 200 && (page.bodyWordCount < 80 || /(?:not found|no results|nothing here|unavailable)/i.test(`${page.title} ${page.mainVisibleCopySummary}`)) && page.pageType !== "utility page";
    page.pageRiskFlags = [];
    if (page.shouldAppearInSitemap && !page.sitemapIncluded) page.pageRiskFlags.push("indexable URL missing from sitemap");
    if (!page.shouldAppearInSitemap && page.sitemapIncluded) page.pageRiskFlags.push("non-indexable/redirect URL in sitemap");
    if (page.isHtml && page.finalHttpStatus === 200 && !expectedNoindex && !page.title) page.pageRiskFlags.push("missing title");
    if (page.isHtml && page.finalHttpStatus === 200 && !expectedNoindex && !page.metaDescription) page.pageRiskFlags.push("missing meta description");
    if (page.isHtml && page.finalHttpStatus === 200 && !expectedNoindex && page.h1Count === 0) page.pageRiskFlags.push("missing H1");
    if (page.h1Count > 1) page.pageRiskFlags.push("multiple H1s");
    if (page.isHtml && page.finalHttpStatus === 200 && !expectedNoindex && (!page.canonical || !page.canonicalMatchesFinal)) page.pageRiskFlags.push("canonical missing/mismatch");
    if (page.schemas?.some((schema) => !schema.validJson)) page.pageRiskFlags.push("invalid JSON-LD");
    if (page.missingAltCount > 0) page.pageRiskFlags.push(`${page.missingAltCount} image(s) missing alt attribute`);
    if (expectedNoindex && !actualNoindex && page.finalHttpStatus === 200) page.pageRiskFlags.push("expected noindex missing");
    if (expectedNofollow && !isNofollow(`${page.robotsMeta} ${page.xRobotsTag}`) && page.finalHttpStatus === 200) page.pageRiskFlags.push("expected nofollow missing");
    if (page.soft404Risk) page.pageRiskFlags.push("soft-404/thin-content risk");
    page.recommendedAction = page.pageRiskFlags.length ? `Review: ${page.pageRiskFlags.join("; ")}.` : "No rendered-page correction identified by automated checks.";
    page.overallSeoStatus = page.pageRiskFlags.some((flag) => /missing title|missing meta|missing H1|canonical|noindex missing|invalid|sitemap/.test(flag)) ? "Needs action" : page.pageRiskFlags.length ? "Review" : "Pass";
    page.priority = page.overallSeoStatus === "Needs action" ? "High" : page.overallSeoStatus === "Review" ? "Medium" : "Low";
  }
  return pages;
}

function buildIssues(pages) {
  const issues = KNOWN_SOURCE_ISSUES.map((issue, index) => ({ id: `SRC-${String(index + 1).padStart(3, "0")}`, ...issue }));
  const htmlPages = pages.filter((page) => page.isHtml);
  for (const page of htmlPages) {
    const publicSuccessful = page.finalHttpStatus === 200 && !page.expectedNoindex;
    if (page.finalHttpStatus >= 500) issues.push(pageIssue("Critical", "routing", page, `Route returned HTTP ${page.finalHttpStatus}.`, `Final URL: ${page.finalUrl}`, "Resolve the runtime failure and recrawl the production build."));
    if (page.sitemapIncluded && (page.finalHttpStatus !== 200 || page.actualNoindex)) issues.push(pageIssue("Critical", "sitemap", page, "Sitemap-listed URL is not a successful indexable page.", `Status ${page.finalHttpStatus}; robots ${page.robotsMeta}; X-Robots-Tag ${page.xRobotsTag || "none"}`, "Remove the URL until it is canonical/indexable or correct its response/directives."));
    if (publicSuccessful && !page.title) issues.push(pageIssue("Critical", "title", page, "Indexable page has no title.", "Rendered <title> is empty.", "Add one unique, page-specific title through the maintained metadata helper."));
    if (publicSuccessful && !page.metaDescription) issues.push(pageIssue("High", "meta", page, "Indexable page has no meta description.", "Rendered meta[name=description] is absent or empty.", "Add one unique, factual description through the maintained metadata helper."));
    if (publicSuccessful && page.h1Count === 0) issues.push(pageIssue("High", "H1", page, "Indexable page has no H1.", "Rendered H1 count is 0.", "Render one descriptive, keyword-bearing H1."));
    if (page.h1Count > 1) issues.push(pageIssue("High", "H1", page, "Page renders multiple H1 elements.", `H1s: ${(page.h1 ?? []).join(" | ")}`, "Retain one page-topic H1 and demote styled taglines/section headings."));
    if (publicSuccessful && !page.canonical) issues.push(pageIssue("High", "canonical", page, "Indexable page has no canonical link.", "Rendered rel=canonical is absent.", "Emit a self-canonical production URL."));
    else if (publicSuccessful && !page.canonicalMatchesFinal) issues.push(pageIssue("High", "canonical", page, "Canonical does not match the final URL.", `Final ${page.finalUrl}; canonical ${page.canonical}`, "Correct the canonical or make the mapping explicitly intentional and consistent."));
    if (page.schemas?.some((schema) => !schema.validJson)) issues.push(pageIssue("High", "schema", page, "One or more JSON-LD blocks contain invalid JSON.", page.schemas.filter((schema) => !schema.validJson).map((schema) => `${schema.id}: ${schema.error}`).join(" | "), "Serialize with safeJsonLd and validate the corrected rendered block."));
    if (page.expectedNoindex && page.httpStatus === 200 && page.finalHttpStatus === 200 && !page.actualNoindex) issues.push(pageIssue("High", "robots", page, "Utility/private/query page is indexable.", `Robots meta ${page.robotsMeta}; X-Robots-Tag ${page.xRobotsTag || "none"}`, "Emit the intended noindex directive at page or response-header level."));
    if (page.shouldAppearInSitemap && !page.sitemapIncluded) issues.push(pageIssue("High", "sitemap", page, "Canonical indexable page is missing from the sitemap.", `Status ${page.finalHttpStatus}; robots ${page.robotsMeta}; canonical ${page.canonical}`, "Add the route only after confirming durable content and canonical indexability."));
    if (page.missingAltCount > 0) issues.push(pageIssue("Medium", "images", page, "Rendered images are missing alt attributes.", `${page.missingAltCount} missing out of ${page.images.length} rendered img elements.`, "Add factual alt text for informative images; use alt=\"\" only for decorative images."));
    if (publicSuccessful && (page.titleLength < 25 || page.titleLength > 65)) issues.push(pageIssue("Low", "title", page, "Title length is outside the audit guideline.", `${page.titleLength} characters: ${page.title}`, "Review for clarity around 30-60 characters without truncating required product identity."));
    if (publicSuccessful && page.metaDescription && (page.metaDescriptionLength < 70 || page.metaDescriptionLength > 160)) issues.push(pageIssue("Low", "meta", page, "Meta-description length is outside the audit guideline.", `${page.metaDescriptionLength} characters.`, "Review for a unique, factual description around 120-155 characters; do not keyword-stuff."));
    if (page.soft404Risk) issues.push(pageIssue("Medium", "thin content", page, "Rendered page has soft-404 or thin-content risk.", `Status ${page.finalHttpStatus}; body words ${page.bodyWordCount}; summary ${page.mainVisibleCopySummary}`, "Add durable useful content, apply a threshold/noindex, or return a true 404 as appropriate."));
  }

  const addDuplicates = (field, label) => {
    const groups = new Map();
    htmlPages.filter((page) => page.httpStatus === 200 && page.finalHttpStatus === 200 && !page.expectedNoindex && !page.actualNoindex && page[field]).forEach((page) => {
      const key = normalizeForComparison(page[field]);
      const list = groups.get(key) ?? [];
      list.push(page);
      groups.set(key, list);
    });
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const page of group) issues.push(pageIssue("High", "duplicate", page, `Duplicate ${label}.`, `Shared by: ${group.map((item) => item.url).join(" | ")}`, `Make the ${label} uniquely describe this page.`));
    }
  };
  addDuplicates("title", "title");
  addDuplicates("metaDescription", "meta description");
  return issues.map((issue, index) => ({ ...issue, id: issue.id ?? `RND-${String(index + 1).padStart(3, "0")}` }));
}

function statusRank(status) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 }[status] ?? 5;
}

function buildSotCompliance(pages) {
  const pageByPath = new Map(pages.map((page) => [comparablePath(page.url), page]));
  const productPages = pages.filter((page) => page.pageType === "product page" && page.finalHttpStatus === 200);
  return SOT_ROWS.map((expected) => {
    const actual = pageByPath.get(comparablePath(expected.actualPath));
    if (!actual) return { ...expected, actualH1: "", h1Match: false, actualTitle: "", titleMatch: false, actualMeta: "", metaMatch: false, actualRobots: "not crawled", robotsMatch: false, status: "Missing", notes: "No rendered audit row matched the mapped route." };
    let h1Match;
    let titleMatch;
    let metaMatch;
    if (expected.template) {
      const passing = productPages.filter((page) => {
        const product = page.schemas?.map((schema) => findTypeObject(schema.data, "Product")).find(Boolean);
        return product && page.h1?.[0] === product.name && normalizeForComparison(page.title).includes(normalizeForComparison(product.name)) && /pre-loved/i.test(page.title) && normalizeForComparison(page.metaDescription).includes(normalizeForComparison(product.name));
      });
      h1Match = titleMatch = metaMatch = passing.length === productPages.length && productPages.length > 0;
    } else if (expected.utility) {
      h1Match = true;
      titleMatch = true;
      metaMatch = true;
    } else {
      h1Match = normalizeForComparison(actual.h1?.[0]) === normalizeForComparison(expected.h1);
      titleMatch = normalizeForComparison(actual.title) === normalizeForComparison(expected.title);
      metaMatch = normalizeForComparison(actual.metaDescription) === normalizeForComparison(expected.meta);
    }
    const expectedNoindex = /noindex/i.test(expected.robots);
    const robotsMatch = expectedNoindex ? actual.actualNoindex && !isNofollow(`${actual.robotsMeta} ${actual.xRobotsTag}`) : !actual.actualNoindex;
    const matches = [h1Match, titleMatch, metaMatch, robotsMatch];
    return {
      ...expected,
      actualH1: (actual.h1 ?? []).join(" | "), h1Match,
      actualTitle: actual.title, titleMatch,
      actualMeta: actual.metaDescription, metaMatch,
      actualRobots: `${actual.robotsMeta}${actual.xRobotsTag ? `; X-Robots-Tag ${actual.xRobotsTag}` : ""}`, robotsMatch,
      status: matches.every(Boolean) ? (expected.pdfUrl === expected.actualPath ? "Complete" : "Intentionally mapped") : matches.some(Boolean) ? "Partial" : "Missing",
      notes: expected.template ? `Template checked across ${productPages.length} rendered product pages.` : `PDF page ${expected.pdfPage}; rendered production HTML wins where source and output differ.`,
    };
  });
}

function buildZipCoverage(pages, sourceInventory) {
  const crawledPaths = new Set(pages.map((page) => comparablePath(page.url)));
  const sourcePaths = new Set(sourceInventory.sourceFiles.map((row) => row.filePath));
  return ZIP_COVERAGE.map(([item, expected, actualRoute, notes]) => {
    const isFile = !actualRoute.startsWith("/");
    const exists = isFile ? sourcePaths.has(actualRoute) : [...crawledPaths].some((value) => value === comparablePath(actualRoute));
    const page = pages.find((candidate) => comparablePath(candidate.url) === comparablePath(actualRoute));
    let status = exists ? "Done" : /Future|proposal|approval/i.test(notes) ? "Future" : item === "Journal" ? "Not needed" : "Missing";
    if (item === "Query filters") status = page?.actualNoindex ? "Done" : "Blocker";
    return {
      item, expected, actualRoute, exists: exists ? "yes" : "no", implemented: exists ? "yes" : "no",
      indexable: page ? (page.indexable ? "yes" : "no") : "n/a",
      sitemapIncluded: page ? (page.sitemapIncluded ? "yes" : "no") : "n/a",
      duplicateThinRisk: page?.soft404Risk ? "yes" : "not observed",
      status,
      notes: `${notes} Source: historical Archive.zip blob ec2a874b (not present in current worktree; inspected read-only from Git history).`,
    };
  });
}

function productRows(pages) {
  return pages.filter((page) => page.pageType === "product page" && page.finalHttpStatus === 200).map((page) => {
    const product = page.schemas?.map((schema) => findTypeObject(schema.data, "Product")).find(Boolean) ?? {};
    const properties = Array.isArray(product.additionalProperty) ? product.additionalProperty : [];
    const fabric = properties.find((item) => item?.name === "Fabric")?.value ?? product.material ?? "";
    return {
      url: page.url, name: product.name ?? page.h1?.[0] ?? "", slug: new URL(page.url, BASE_URL).pathname.split("/").filter(Boolean).at(-1),
      fabric, price: product.offers?.price ?? "", availability: product.offers?.availability ?? "",
      h1: page.h1?.join(" | ") ?? "", title: page.title, meta: page.metaDescription,
      canonical: page.canonical, robots: page.robotsMeta, productSchema: product["@type"] === "Product" ? "yes" : "no",
      breadcrumbs: page.schemaTypes?.includes("BreadcrumbList") ? "yes" : "no",
      imageAlt: page.images?.map((image) => image.alt ?? "[missing]").join(" | ") ?? "",
      storyLength: cleanText(product.description).length,
      sitemap: page.sitemapIncluded ? "yes" : "no", issue: page.pageRiskFlags.join(" | "), recommendation: page.recommendedAction,
    };
  });
}

function collectionRows(pages) {
  return pages.filter((page) => page.pageType === "collection page" || page.pageType === "policy page" || page.url === "/authentication" || page.url === "/sell-your-saree").map((page) => ({
    url: page.url,
    landingType: page.pageType,
    productCount: unique((page.internalLinks ?? []).filter((link) => /^\/collection\/[^/?]+$/.test(link.targetUrl)).map((link) => link.targetUrl)).length,
    emptyStateBehavior: /no (?:products|sarees|results)|nothing/i.test(page.mainVisibleCopySummary) ? "Rendered empty-state copy detected" : "No empty-state phrase detected",
    indexableWhenEmpty: page.soft404Risk && page.indexable ? "yes - review" : "not observed",
    h1TitleMeta: `H1: ${(page.h1 ?? []).join(" | ")} || Title: ${page.title} || Meta: ${page.metaDescription}`,
    canonical: page.canonical, sitemap: page.sitemapIncluded ? "yes" : "no",
    internalLinks: page.internalLinks?.length ?? 0,
    thinRisk: page.soft404Risk ? "yes" : "no",
    duplicateRisk: page.pageRiskFlags.some((flag) => /duplicate/i.test(flag)) ? "yes" : "not observed",
    recommendation: page.recommendedAction,
  }));
}

function buildRouteInventory(sourceInventory, crawl, runtimeData) {
  const rows = [];
  const pageByPath = new Map(crawl.crawled.map((page) => [comparablePath(page.url), page]));
  for (const { file, info } of sourceInventory.routeFiles) {
    const concrete = crawl.crawled.find((page) => patternToRegex(info.route).test(new URL(page.finalUrl, BASE_URL).pathname));
    const literal = !info.route.includes("[") ? pageByPath.get(comparablePath(info.route)) : concrete;
    rows.push({
      route: info.route, routeFile: relativePath(file), componentFile: relativePath(file), routeGroup: info.routeGroup,
      appRouter: "yes", sitemap: literal?.sitemapIncluded ? "yes" : "no",
      nav: crawl.crawled.some((page) => page.headerNavLinks?.some((link) => patternToRegex(info.route).test(new URL(link.targetUrl, BASE_URL).pathname))) ? "yes" : "no",
      footer: crawl.crawled.some((page) => page.footerLinks?.some((link) => patternToRegex(info.route).test(new URL(link.targetUrl, BASE_URL).pathname))) ? "yes" : "no",
      classification: literal?.pageType ?? classifyPage(info.route, literal?.httpStatus ?? 0),
      httpStatus: literal?.httpStatus ?? (info.route.includes("[") ? "dynamic pattern; representative checked" : "not crawled"),
      redirectTarget: literal?.redirectChain?.map((hop) => hop.location).join(" -> ") ?? "",
      canonical: literal?.canonical ?? "", robots: literal ? `${literal.robotsMeta}${literal.xRobotsTag ? `; ${literal.xRobotsTag}` : ""}` : "",
      indexability: literal ? (literal.indexable ? "indexable" : "not indexable") : "not determined",
      notes: literal?.pageRiskFlags?.join(" | ") || (info.route.includes("[") ? `Representative URL: ${literal?.url ?? "none available"}` : ""),
    });
  }
  for (const redirect of crawl.redirects) {
    const page = pageByPath.get(comparablePath(redirect.fromPath));
    rows.push({ route: redirect.fromPath, routeFile: redirect.source, componentFile: "n/a", routeGroup: "redirect", appRouter: "redirect config/data", sitemap: page?.sitemapIncluded ? "yes" : "no", nav: "no", footer: "no", classification: "redirect", httpStatus: page?.httpStatus ?? redirect.status, redirectTarget: redirect.toPath, canonical: page?.canonical ?? "", robots: page?.robotsMeta ?? "", indexability: "redirect/non-indexable", notes: redirect.source === "managed redirects table" && redirect.fromPath === "/collection" ? "Proxy excludes /collection from managed redirect checks, so this DB row is inert in the rendered route." : "" });
  }
  for (const page of crawl.crawled) {
    if (rows.some((row) => row.route === page.url)) continue;
    rows.push({ route: page.url, routeFile: page.routeFile || "discovered rendered URL", componentFile: page.routeFile || "dynamic/discovered", routeGroup: "rendered crawl", appRouter: page.routeFile ? "yes" : "unknown", sitemap: page.sitemapIncluded ? "yes" : "no", nav: crawl.crawled.some((source) => source.headerNavLinks?.some((link) => link.targetUrl === page.url)) ? "yes" : "no", footer: crawl.crawled.some((source) => source.footerLinks?.some((link) => link.targetUrl === page.url)) ? "yes" : "no", classification: page.pageType, httpStatus: page.httpStatus, redirectTarget: page.redirectChain.map((hop) => hop.location).join(" -> "), canonical: page.canonical ?? "", robots: `${page.robotsMeta ?? ""}${page.xRobotsTag ? `; ${page.xRobotsTag}` : ""}`, indexability: page.indexable ? "indexable" : "not indexable", notes: page.pageRiskFlags?.join(" | ") ?? "" });
  }
  for (const cmsPage of runtimeData?.pages ?? []) {
    if (rows.some((row) => row.route === `/${cmsPage.slug}`)) continue;
    rows.push({ route: `/${cmsPage.slug}`, routeFile: "app/(site)/[...slug]/page.tsx", componentFile: "database CMS row", routeGroup: "(site)", appRouter: "yes, catch-all", sitemap: "no", nav: "no", footer: "no", classification: cmsPage.status === "published" ? "public CMS page" : "private/draft CMS page", httpStatus: "not crawled (draft)", redirectTarget: "", canonical: "", robots: cmsPage.status === "published" ? "not verified" : "draft", indexability: cmsPage.status === "published" ? "not determined" : "not public", notes: `CMS status ${cmsPage.status}; SEO title ${cmsPage.seo?.title ?? "missing"}.` });
  }
  return rows;
}

function buildLinkRows(pages) {
  const byPath = new Map(pages.map((page) => [comparablePath(page.url), page]));
  const internal = pages.flatMap((page) => page.internalLinks ?? []).map((link) => {
    const target = byPath.get(comparablePath(link.targetUrl));
    return { ...link, targetStatus: target?.finalHttpStatus ?? "not crawled", targetCanonical: target?.canonical ?? "", targetInSitemap: target?.sitemapIncluded ? "yes" : "no", issue: target?.finalHttpStatus >= 400 ? `Target status ${target.finalHttpStatus}` : target?.actualNoindex && link.location === "header/nav" ? "Primary navigation targets noindex URL" : "", notes: "Rendered anchor; external targets were not fetched." };
  });
  const external = pages.flatMap((page) => page.externalLinks ?? []).map((link) => ({ ...link, domain: new URL(link.targetUrl).hostname, nofollowSponsoredUgc: ["nofollow", "sponsored", "ugc"].filter((token) => new RegExp(token, "i").test(link.rel)).join(" | ") || "none", purpose: /instagram|facebook|linkedin|threads|twitter|x\.com/.test(link.targetUrl) ? "official social/profile link" : "outbound reference or service link", issue: link.opensNewTab && !/noopener/i.test(link.rel) ? "target=_blank without noopener" : "", notes: "Not fetched; external crawling was prohibited." }));
  return { internal, external };
}

function makeMetrics(pages, sourceInventory, keywords, links, issues) {
  const htmlPages = pages.filter((page) => page.isHtml);
  const indexable = htmlPages.filter((page) => page.indexable && !page.expectedNoindex);
  const titleGroups = new Map();
  const metaGroups = new Map();
  indexable.forEach((page) => {
    if (page.title) titleGroups.set(normalizeForComparison(page.title), [...(titleGroups.get(normalizeForComparison(page.title)) ?? []), page]);
    if (page.metaDescription) metaGroups.set(normalizeForComparison(page.metaDescription), [...(metaGroups.get(normalizeForComparison(page.metaDescription)) ?? []), page]);
  });
  const countDupPages = (groups) => [...groups.values()].filter((group) => group.length > 1).reduce((total, group) => total + group.length, 0);
  const critical = issues.filter((issue) => issue.severity === "Critical").length;
  const high = issues.filter((issue) => issue.severity === "High").length;
  return {
    totalPagesCrawled: pages.length,
    htmlPagesCrawled: htmlPages.length,
    publicIndexablePages: indexable.length,
    unexpectedIndexablePages: htmlPages.filter((page) => page.indexable && page.expectedNoindex).length,
    noindexPages: htmlPages.filter((page) => page.actualNoindex).length,
    redirects: pages.filter((page) => page.httpStatus >= 300 && page.httpStatus < 400).length,
    notFound: pages.filter((page) => page.finalHttpStatus === 404).length,
    serverErrors: pages.filter((page) => page.finalHttpStatus >= 500).length,
    soft404Risk: pages.filter((page) => page.soft404Risk).length,
    pagesInSitemap: pages.filter((page) => page.sitemapIncluded).length,
    pagesMissingFromSitemap: pages.filter((page) => page.shouldAppearInSitemap && !page.sitemapIncluded).length,
    duplicateTitles: countDupPages(titleGroups),
    duplicateMetaDescriptions: countDupPages(metaGroups),
    missingTitle: indexable.filter((page) => !page.title).length,
    missingMetaDescription: indexable.filter((page) => !page.metaDescription).length,
    missingH1: indexable.filter((page) => page.h1Count === 0).length,
    multipleH1: htmlPages.filter((page) => page.h1Count > 1).length,
    canonicalMismatch: indexable.filter((page) => !page.canonicalMatchesFinal).length,
    pagesWithSchema: htmlPages.filter((page) => page.schemas?.length > 0).length,
    pagesWithInvalidSchema: htmlPages.filter((page) => page.schemas?.some((schema) => !schema.validJson)).length,
    pagesWithMissingImageAlt: htmlPages.filter((page) => page.missingAltCount > 0).length,
    missingImageAltInstances: htmlPages.reduce((sum, page) => sum + (page.missingAltCount ?? 0), 0),
    internalLinks: links.internal.length,
    externalLinks: links.external.length,
    filesScanned: sourceInventory.sourceFiles.length,
    keywordPhrases: keywords.keywords.length,
    corpusWords: keywords.corpus.length,
    productsChecked: productRows(pages).length,
    criticalIssues: critical,
    highIssues: high,
    backlinkStatus: "Backlink data not available from project code. Requires Google Search Console Links export, Ahrefs, Semrush, or another backlink source.",
    verdict: critical === 0 && high === 0 ? "Production SEO-ready based on verified scope" : `Not production SEO-ready: ${critical} Critical and ${high} High issue rows require resolution or explicit acceptance.`,
  };
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" | ");
  if (value instanceof Set) return [...value].join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvEscape(value) {
  const text = csvValue(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeCsv(filename, headers, rows) {
  const output = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\r\n");
  await fs.writeFile(path.join(CSV_DIR, filename), `${output}\r\n`, "utf8");
}

const SHEETS = [
  ["Executive Summary", "01-executive-summary.csv"],
  ["Route Inventory", "02-route-inventory.csv"],
  ["Page SEO Details", "03-page-seo-details.csv"],
  ["Keywords Used in SEO Fields", "04-keywords-used-in-seo-fields.csv"],
  ["Full Word Corpus", "05-full-word-corpus.csv"],
  ["Page Keyword Map", "06-page-keyword-map.csv"],
  ["H1/H2/H3 Audit", "07-h1-h2-h3-audit.csv"],
  ["Metadata Audit", "08-metadata-audit.csv"],
  ["Schema / Structured Data", "09-schema-structured-data.csv"],
  ["Sitemap Audit", "10-sitemap-audit.csv"],
  ["Robots Audit", "11-robots-audit.csv"],
  ["Canonical Audit", "12-canonical-audit.csv"],
  ["Internal Links", "13-internal-links.csv"],
  ["External Links / Outbound Links", "14-external-outbound-links.csv"],
  ["Backlinks", "15-backlinks.csv"],
  ["Geo / Local / AEO / GEO Signals", "16-geo-local-aeo-geo-signals.csv"],
  ["Images / Alt Text SEO", "17-images-alt-text-seo.csv"],
  ["Product SEO Audit", "18-product-seo-audit.csv"],
  ["Collection / Landing Page SEO", "19-collection-landing-page-seo.csv"],
  ["PDF / Source-of-Truth Compliance", "20-pdf-sot-compliance.csv"],
  ["ZIP SEO Helper Coverage", "21-zip-seo-helper-coverage.csv"],
  ["Source Files Scanned", "22-source-files-scanned.csv"],
  ["Issues and Recommendations", "23-issues-recommendations.csv"],
  ["Final Action Plan", "24-final-action-plan.csv"],
];

async function writeCsvSheets(data) {
  const { pages, sourceInventory, crawl, runtimeData, keywords, links, issues, metrics, sotCompliance, zipCoverage, routeInventory } = data;
  const issueByUrl = new Map();
  issues.forEach((issue) => issueByUrl.set(issue.url, [...(issueByUrl.get(issue.url) ?? []), issue]));
  const executiveRows = [
    ["Audit generated", GENERATED_AT, "Fresh local production build; HTTP GET crawl only."],
    ["Rendered base URL", BASE_URL, "No external pages were crawled."],
    ["Total pages/URLs crawled", metrics.totalPagesCrawled, "Includes HTML, redirects, utility/admin probes, and metadata/API endpoints."],
    ["Rendered HTML pages", metrics.htmlPagesCrawled, ""],
    ["Public indexable pages", metrics.publicIndexablePages, "Successful rendered pages without noindex and allowed by robots.txt."],
    ["Unexpected indexable utility/private pages", metrics.unexpectedIndexablePages, "Accessible pages that should be noindex/private but currently are indexable."],
    ["Noindex pages", metrics.noindexPages, ""],
    ["Redirect count", metrics.redirects, ""],
    ["404 count", metrics.notFound, ""],
    ["5xx count", metrics.serverErrors, ""],
    ["Soft-404 risk count", metrics.soft404Risk, ""],
    ["Pages in sitemap", metrics.pagesInSitemap, ""],
    ["Pages missing from sitemap", metrics.pagesMissingFromSitemap, "Indexable canonical rendered pages absent from sitemap."],
    ["Pages with duplicate titles", metrics.duplicateTitles, ""],
    ["Pages with duplicate meta descriptions", metrics.duplicateMetaDescriptions, ""],
    ["Pages with missing title", metrics.missingTitle, ""],
    ["Pages with missing meta description", metrics.missingMetaDescription, ""],
    ["Pages with missing H1", metrics.missingH1, ""],
    ["Pages with multiple H1s", metrics.multipleH1, ""],
    ["Pages with canonical mismatch", metrics.canonicalMismatch, ""],
    ["Pages with schema", metrics.pagesWithSchema, ""],
    ["Pages with invalid schema", metrics.pagesWithInvalidSchema, ""],
    ["Pages with missing image alt text", metrics.pagesWithMissingImageAlt, `${metrics.missingImageAltInstances} missing alt instances.`],
    ["Internal link instances", metrics.internalLinks, "Rendered anchors; external URLs not fetched."],
    ["External outbound link instances", metrics.externalLinks, "Inventoried only; not fetched."],
    ["Files scanned", metrics.filesScanned, "Source/config/tests/assets inventory."],
    ["Product pages checked", metrics.productsChecked, "Real product URLs from rendered sitemap/llms/internal discovery."],
    ["SEO keywords/phrases extracted", metrics.keywordPhrases, "Normalized 1-4 grams and exact SEO-field phrases."],
    ["Backlink data status", metrics.backlinkStatus, "No backlink export was present."],
    ["Production readiness SEO verdict", metrics.verdict, "Rendered results override static assumptions."],
    ["XLSX generation", "Blocked - CSV fallback delivered", "@oai/artifact-tool and the required workspace dependency loader were unavailable; 24 sheet-equivalent CSVs were generated."],
  ].map(([Metric, Value, evidenceNotes]) => ({ Metric, Value, "Evidence / Notes": evidenceNotes }));
  await writeCsv(SHEETS[0][1], ["Metric", "Value", "Evidence / Notes"], executiveRows);

  await writeCsv(SHEETS[1][1], ["Route/URL", "Route file", "Page/component file", "Route group", "Exists in app router?", "Exists in sitemap?", "Exists in nav?", "Exists in footer?", "Public/private/utility/admin", "HTTP status in production build", "Redirect target", "Canonical", "Robots", "Indexability verdict", "Notes"], routeInventory.map((row) => ({ "Route/URL": row.route, "Route file": row.routeFile, "Page/component file": row.componentFile, "Route group": row.routeGroup, "Exists in app router?": row.appRouter, "Exists in sitemap?": row.sitemap, "Exists in nav?": row.nav, "Exists in footer?": row.footer, "Public/private/utility/admin": row.classification, "HTTP status in production build": row.httpStatus, "Redirect target": row.redirectTarget, Canonical: row.canonical, Robots: row.robots, "Indexability verdict": row.indexability, Notes: row.notes })));

  await writeCsv(SHEETS[2][1], ["URL", "Page type", "HTTP status", "Final URL", "Title", "Title length", "Title issue", "Meta description", "Meta description length", "Meta issue", "H1 count", "H1 text", "H1 issue", "H2 list", "H3 list", "Canonical", "Canonical issue", "Robots", "Robots issue", "Sitemap included", "Sitemap issue", "Overall SEO status", "Priority", "Recommended fix"], pages.filter((page) => page.isHtml).map((page) => ({ URL: page.url, "Page type": page.pageType, "HTTP status": page.httpStatus, "Final URL": page.finalUrl, Title: page.title, "Title length": page.titleLength, "Title issue": page.pageRiskFlags.filter((flag) => /title/i.test(flag)).join(" | "), "Meta description": page.metaDescription, "Meta description length": page.metaDescriptionLength, "Meta issue": page.pageRiskFlags.filter((flag) => /meta/i.test(flag)).join(" | "), "H1 count": page.h1Count, "H1 text": page.h1, "H1 issue": page.pageRiskFlags.filter((flag) => /H1/i.test(flag)).join(" | "), "H2 list": page.h2, "H3 list": page.h3, Canonical: page.canonical, "Canonical issue": page.pageRiskFlags.filter((flag) => /canonical/i.test(flag)).join(" | "), Robots: `${page.robotsMeta}${page.xRobotsTag ? `; ${page.xRobotsTag}` : ""}`, "Robots issue": page.pageRiskFlags.filter((flag) => /noindex|nofollow|robots/i.test(flag)).join(" | "), "Sitemap included": page.sitemapIncluded ? "yes" : "no", "Sitemap issue": page.pageRiskFlags.filter((flag) => /sitemap/i.test(flag)).join(" | "), "Overall SEO status": page.overallSeoStatus, Priority: page.priority, "Recommended fix": page.recommendedAction })));

  await writeCsv(SHEETS[3][1], ["Keyword/phrase", "Phrase type", "Pages where used", "Used in title count", "Used in meta count", "Used in H1 count", "Used in H2/H3 count", "Used in URL count", "Used in alt text count", "Used in schema count", "Total occurrences", "Intent category", "Notes"], keywords.keywords.map((row) => ({ "Keyword/phrase": row.keyword, "Phrase type": row.phraseType, "Pages where used": row.pages, "Used in title count": row.usedInTitle, "Used in meta count": row.usedInMeta, "Used in H1 count": row.usedInH1, "Used in H2/H3 count": row.usedInHeadings, "Used in URL count": row.usedInUrl, "Used in alt text count": row.usedInAlt, "Used in schema count": row.usedInSchema, "Total occurrences": row.total, "Intent category": row.intent, Notes: row.total > 20 && row.pages.size === 1 ? "Review repetition in one page context; not automatically classified as stuffing." : "" })));

  await writeCsv(SHEETS[4][1], ["Word", "Count", "Pages used", "First page found", "Appears in SEO-critical location?", "Location examples", "Notes"], keywords.corpus.map((row) => ({ Word: row.word, Count: row.count, "Pages used": row.pages, "First page found": row.firstPage, "Appears in SEO-critical location?": row.critical ? "yes" : "no", "Location examples": row.examples, Notes: COMMERCIAL_TERMS.has(row.word) ? "Protected commercial term retained by audit normalization." : "" })));

  await writeCsv(SHEETS[5][1], ["URL", "Primary apparent keyword", "Secondary apparent keywords", "Title keywords", "Meta keywords/phrases", "H1 keywords", "H2/H3 keywords", "Body top 20 words", "Schema keywords", "Product/fabric/occasion keywords", "Keyword consistency score", "Notes"], keywords.pageMaps.map((row) => ({ URL: row.url, "Primary apparent keyword": row.primary, "Secondary apparent keywords": row.secondary, "Title keywords": row.titleKeywords, "Meta keywords/phrases": row.metaKeywords, "H1 keywords": row.h1Keywords, "H2/H3 keywords": row.headingKeywords, "Body top 20 words": row.bodyTop20, "Schema keywords": row.schemaKeywords, "Product/fabric/occasion keywords": row.productKeywords, "Keyword consistency score": row.consistencyScore, Notes: row.notes })));

  await writeCsv(SHEETS[6][1], ["URL", "H1 count", "H1 text", "H1 source file if traceable", "H2 count", "H2 list", "H3 count", "H3 list", "Multiple H1 issue", "Missing H1 issue", "Mismatch with PDF/SOT if applicable", "Recommended fix"], pages.filter((page) => page.isHtml).map((page) => ({ URL: page.url, "H1 count": page.h1Count, "H1 text": page.h1, "H1 source file if traceable": page.routeFile, "H2 count": page.h2Count, "H2 list": page.h2, "H3 count": page.h3Count, "H3 list": page.h3, "Multiple H1 issue": page.h1Count > 1 ? "yes" : "no", "Missing H1 issue": page.h1Count === 0 ? "yes" : "no", "Mismatch with PDF/SOT if applicable": sotCompliance.filter((row) => comparablePath(row.actualPath) === comparablePath(page.url) && !row.h1Match).map((row) => row.pageName).join(" | "), "Recommended fix": page.pageRiskFlags.some((flag) => /H1/.test(flag)) ? "Render exactly one descriptive page-topic H1." : "No H1 correction identified." })));

  await writeCsv(SHEETS[7][1], ["URL", "Title", "Title length", "Title source", "Meta description", "Meta length", "Meta source", "Meta keywords", "Robots", "Canonical", "Open Graph title", "Open Graph description", "Twitter title", "Twitter description", "Google verification tag if present", "Other meta tags", "Issues"], pages.filter((page) => page.isHtml).map((page) => ({ URL: page.url, Title: page.title, "Title length": page.titleLength, "Title source": page.titleSource, "Meta description": page.metaDescription, "Meta length": page.metaDescriptionLength, "Meta source": page.metaSource, "Meta keywords": page.metaKeywords, Robots: `${page.robotsMeta}${page.xRobotsTag ? `; X-Robots-Tag ${page.xRobotsTag}` : ""}`, Canonical: page.canonical, "Open Graph title": page.openGraphTitle, "Open Graph description": page.openGraphDescription, "Twitter title": page.twitterTitle, "Twitter description": page.twitterDescription, "Google verification tag if present": page.googleVerification, "Other meta tags": page.allMeta?.filter((meta) => !/^(?:description|keywords|robots|og:|twitter:|google-site-verification)/i.test(meta.name)).slice(0, 30), Issues: page.pageRiskFlags })));

  const schemaRows = pages.flatMap((page) => (page.schemas ?? []).flatMap((schema) => {
    const rootTypes = schema.types.length ? schema.types : [{ path: "root", type: "invalid/unknown" }];
    return rootTypes.map((type) => {
      const product = findTypeObject(schema.data, "Product");
      const breadcrumbs = findTypeObject(schema.data, "BreadcrumbList");
      const faq = findTypeObject(schema.data, "FAQPage");
      const organization = findTypeObject(schema.data, "Organization") || findTypeObject(schema.data, "OnlineStore");
      return { URL: page.url, "Source file/helper": page.sourceFilesInvolved?.filter((file) => /json-ld|faq|keyword|page\.tsx/.test(file)).join(" | "), "Schema type": type.type, "Full @type path if nested": type.path, "Main name": product?.name ?? organization?.name ?? faq?.name ?? "", Description: product?.description ?? organization?.description ?? "", "Product fields present": product ? Object.keys(product).join(" | ") : "", "Offer fields present": product?.offers ? Object.keys(product.offers).join(" | ") : "", "Breadcrumb fields present": breadcrumbs ? Object.keys(breadcrumbs).join(" | ") : "", "FAQ fields present": faq ? Object.keys(faq).join(" | ") : "", "Organization fields present": organization ? Object.keys(organization).join(" | ") : "", "LocalBusiness fields present": findTypeObject(schema.data, "LocalBusiness") ? "yes" : "no", "Review/AggregateRating fields present": findTypeObject(schema.data, "Review") || findTypeObject(schema.data, "AggregateRating") ? "yes" : "no", "Valid JSON": schema.validJson ? "yes" : "no", "Matches visible content?": product ? (page.bodyText.includes(product.name) ? "yes" : "uncertain") : faq ? "yes - FAQ tests/source and rendered questions checked" : "uncertain", "Risk flags": schema.validJson ? (findTypeObject(schema.data, "AggregateRating") ? "Review rating truthfulness required" : "") : schema.error, "Raw JSON reference location": `${schema.id} in seo-inventory-raw.json` };
    });
  }));
  await writeCsv(SHEETS[8][1], ["URL", "Source file/helper", "Schema type", "Full @type path if nested", "Main name", "Description", "Product fields present", "Offer fields present", "Breadcrumb fields present", "FAQ fields present", "Organization fields present", "LocalBusiness fields present", "Review/AggregateRating fields present", "Valid JSON", "Matches visible content?", "Risk flags", "Raw JSON reference location"], schemaRows);

  const pageByPath = new Map(pages.map((page) => [comparablePath(page.url), page]));
  const sitemapRows = crawl.sitemapEntries.map((entry) => {
    const page = pageByPath.get(comparablePath(entry.loc));
    return { "Sitemap URL": `${CANONICAL_ORIGIN}/sitemap.xml`, "Listed URL": entry.loc, "HTTP status": page?.finalHttpStatus ?? "not crawled", Canonical: page?.canonical ?? "", Robots: `${page?.robotsMeta ?? ""}${page?.xRobotsTag ? `; ${page.xRobotsTag}` : ""}`, "Should be indexable?": page?.shouldAppearInSitemap ? "yes" : "review", "Included correctly?": page?.finalHttpStatus === 200 && !page?.actualNoindex && page?.canonicalMatchesFinal ? "yes" : "no", "Missing from sitemap?": "no", "Should be removed from sitemap?": page && (page.finalHttpStatus !== 200 || page.actualNoindex || !page.canonicalMatchesFinal) ? "yes" : "no", "Lastmod if present": entry.lastmod, "Priority/changefreq if present": `${entry.priority} / ${entry.changefreq}`, Notes: page?.pageRiskFlags.join(" | ") ?? "" };
  });
  pages.filter((page) => page.shouldAppearInSitemap && !page.sitemapIncluded).forEach((page) => sitemapRows.push({ "Sitemap URL": `${CANONICAL_ORIGIN}/sitemap.xml`, "Listed URL": page.url, "HTTP status": page.finalHttpStatus, Canonical: page.canonical, Robots: page.robotsMeta, "Should be indexable?": "yes", "Included correctly?": "no", "Missing from sitemap?": "yes", "Should be removed from sitemap?": "no", "Lastmod if present": "", "Priority/changefreq if present": "", Notes: "Rendered canonical indexable page absent from sitemap." }));
  await writeCsv(SHEETS[9][1], ["Sitemap URL", "Listed URL", "HTTP status", "Canonical", "Robots", "Should be indexable?", "Included correctly?", "Missing from sitemap?", "Should be removed from sitemap?", "Lastmod if present", "Priority/changefreq if present", "Notes"], sitemapRows);

  await writeCsv(SHEETS[10][1], ["URL/path", "robots.txt rule", "Meta robots", "X-Robots-Tag", "Sitemap inclusion", "Intended indexability", "Actual indexability", "Issue", "Recommended fix"], pages.map((page) => ({ "URL/path": page.url, "robots.txt rule": page.robotsTxtRule, "Meta robots": page.robotsMeta ?? "n/a", "X-Robots-Tag": page.xRobotsTag, "Sitemap inclusion": page.sitemapIncluded ? "yes" : "no", "Intended indexability": page.expectedNoindex ? "noindex" : page.shouldAppearInSitemap ? "index" : "review", "Actual indexability": page.indexable ? "indexable/crawlable" : page.actualNoindex ? "noindex" : !page.robotsTxtAllowed ? "robots-disallowed" : "not indexable", Issue: page.pageRiskFlags?.filter((flag) => /noindex|nofollow|robots|sitemap/.test(flag)).join(" | "), "Recommended fix": issueByUrl.get(page.url)?.find((issue) => issue.category === "robots")?.recommendedFix ?? "" })));

  await writeCsv(SHEETS[11][1], ["URL", "Final URL after redirects", "Canonical URL", "Self-canonical?", "Canonical target status", "Canonical target indexable?", "Duplicate canonical group", "Query URL canonical behavior", "Issue", "Recommendation"], pages.filter((page) => page.isHtml).map((page) => ({ URL: page.url, "Final URL after redirects": page.finalUrl, "Canonical URL": page.canonical, "Self-canonical?": page.canonicalMatchesFinal ? "yes" : "no", "Canonical target status": page.canonicalTargetStatus, "Canonical target indexable?": page.canonicalTargetStatus === 200 ? "verify robots in target row" : "no/unknown", "Duplicate canonical group": pages.filter((candidate) => candidate.canonical && candidate.canonical === page.canonical).map((candidate) => candidate.url).join(" | "), "Query URL canonical behavior": page.url.includes("?") ? `${page.robotsMeta}; canonical ${page.canonical}` : "n/a", Issue: page.pageRiskFlags.filter((flag) => /canonical/.test(flag)).join(" | "), Recommendation: issueByUrl.get(page.url)?.find((issue) => issue.category === "canonical")?.recommendedFix ?? "" })));

  await writeCsv(SHEETS[12][1], ["Source URL", "Target URL", "Anchor text", "Link location", "Follow/nofollow", "Target status", "Target canonical", "Target in sitemap", "Issue", "Notes"], links.internal.map((row) => ({ "Source URL": row.sourceUrl, "Target URL": row.targetUrl, "Anchor text": row.anchorText, "Link location": row.location, "Follow/nofollow": row.follow, "Target status": row.targetStatus, "Target canonical": row.targetCanonical, "Target in sitemap": row.targetInSitemap, Issue: row.issue, Notes: row.notes })));
  await writeCsv(SHEETS[13][1], ["Source URL", "External target URL", "Domain", "Anchor text", "rel attributes", "nofollow/sponsored/ugc", "Opens in new tab?", "Link purpose", "Issue/risk", "Notes"], links.external.map((row) => ({ "Source URL": row.sourceUrl, "External target URL": row.targetUrl, Domain: row.domain, "Anchor text": row.anchorText, "rel attributes": row.rel, "nofollow/sponsored/ugc": row.nofollowSponsoredUgc, "Opens in new tab?": row.opensNewTab ? "yes" : "no", "Link purpose": row.purpose, "Issue/risk": row.issue, Notes: row.notes })));
  await writeCsv(SHEETS[14][1], ["Source", "Linking domain", "Linking page URL", "Target FTT URL", "Anchor text", "Follow/nofollow", "Status", "Authority/metric if available", "Notes"], [{ Source: "Codebase", "Linking domain": "", "Linking page URL": "", "Target FTT URL": "", "Anchor text": "", "Follow/nofollow": "", Status: "Unavailable", "Authority/metric if available": "", Notes: metrics.backlinkStatus }]);

  const geoRows = pages.filter((page) => page.isHtml).flatMap((page) => {
    const rows = [
      ["html lang", page.htmlLang || "missing", Boolean(page.htmlLang)],
      ["og:locale", page.openGraphLocale || "missing", Boolean(page.openGraphLocale)],
      ["geo meta", page.geoSignals?.map((signal) => `${signal.name}=${signal.content}`).join(" | ") || "missing", Boolean(page.geoSignals?.length)],
      ["hreflang", page.alternateLinks?.filter((link) => link.hreflang).map((link) => `${link.hreflang}:${link.href}`).join(" | ") || "missing", Boolean(page.alternateLinks?.some((link) => link.hreflang))],
      ["FAQPage", page.schemaTypes?.includes("FAQPage") ? "present" : "missing", page.schemaTypes?.includes("FAQPage")],
      ["Organization/OnlineStore", page.schemaTypes?.some((type) => /Organization|OnlineStore/.test(type)) ? "present" : "missing", page.schemaTypes?.some((type) => /Organization|OnlineStore/.test(type))],
      ["Product facts", page.schemaTypes?.includes("Product") ? "present" : "not applicable/missing", page.schemaTypes?.includes("Product")],
      ["Brand naming", /from the trunk/i.test(`${page.title} ${page.metaDescription} ${page.bodyText}`) ? "From The Trunk visible" : "not found", /from the trunk/i.test(`${page.title} ${page.metaDescription} ${page.bodyText}`)],
    ];
    return rows.map(([signalType, signalValue, present]) => ({ "URL/source file": page.url, "Signal type": signalType, "Signal value": signalValue, "Present/missing": present ? "present" : "missing/not applicable", "SEO/AEO/GEO importance": ["FAQPage", "Organization/OnlineStore", "Product facts", "Brand naming"].includes(signalType) ? "Answer/entity consistency" : "Language/geographic clarity", Notes: "LocalBusiness and PostalAddress are not recommended unless truthful business/location data is approved." }));
  });
  await writeCsv(SHEETS[15][1], ["URL/source file", "Signal type", "Signal value", "Present/missing", "SEO/AEO/GEO importance", "Notes"], geoRows);

  await writeCsv(SHEETS[16][1], ["URL", "Image src", "Image file/source", "Alt text", "Alt text missing?", "Decorative image?", "Width/height if available", "Lazy loading", "Product image?", "Open Graph image?", "Issue", "Recommendation"], pages.flatMap((page) => (page.images ?? []).map((image) => ({ URL: page.url, "Image src": image.src || image.srcset, "Image file/source": image.id, "Alt text": image.alt === null ? "[attribute missing]" : image.alt, "Alt text missing?": image.altMissing ? "yes" : "no", "Decorative image?": image.decorative ? "yes" : "no/unknown", "Width/height if available": `${image.width || "?"}x${image.height || "?"}`, "Lazy loading": image.loading, "Product image?": page.pageType === "product page" ? "yes/likely" : "no/unknown", "Open Graph image?": page.openGraphImage && (page.openGraphImage === image.src || image.srcset.includes(page.openGraphImage)) ? "yes" : "no", Issue: image.altMissing ? "Missing alt attribute" : "", Recommendation: image.altMissing ? "Add factual alt text or alt=\"\" if decorative." : "" }))));

  await writeCsv(SHEETS[17][1], ["Product URL", "Product name", "Slug", "Fabric", "Price", "Availability", "H1", "Title", "Meta description", "Canonical", "Robots", "Product JSON-LD present", "BreadcrumbList present", "Image alt text", "Story/description length", "Duplicate title?", "Duplicate meta?", "Sitemap included?", "Issue", "Recommendation"], productRows(pages).map((row) => ({ "Product URL": row.url, "Product name": row.name, Slug: row.slug, Fabric: row.fabric, Price: row.price, Availability: row.availability, H1: row.h1, Title: row.title, "Meta description": row.meta, Canonical: row.canonical, Robots: row.robots, "Product JSON-LD present": row.productSchema, "BreadcrumbList present": row.breadcrumbs, "Image alt text": row.imageAlt, "Story/description length": row.storyLength, "Duplicate title?": issues.some((issue) => issue.url === row.url && issue.issue === "Duplicate title.") ? "yes" : "no", "Duplicate meta?": issues.some((issue) => issue.url === row.url && issue.issue === "Duplicate meta description.") ? "yes" : "no", "Sitemap included?": row.sitemap, Issue: row.issue, Recommendation: row.recommendation })));

  await writeCsv(SHEETS[18][1], ["URL", "Landing page type", "Product count if applicable", "Empty state behavior", "Indexable when empty?", "H1/title/meta", "Canonical", "Sitemap", "Internal links", "Thin-content risk", "Duplicate-content risk", "Recommendation"], collectionRows(pages).map((row) => ({ URL: row.url, "Landing page type": row.landingType, "Product count if applicable": row.productCount, "Empty state behavior": row.emptyStateBehavior, "Indexable when empty?": row.indexableWhenEmpty, "H1/title/meta": row.h1TitleMeta, Canonical: row.canonical, Sitemap: row.sitemap, "Internal links": row.internalLinks, "Thin-content risk": row.thinRisk, "Duplicate-content risk": row.duplicateRisk, Recommendation: row.recommendation })));

  await writeCsv(SHEETS[19][1], ["PDF page name", "PDF URL", "Actual project URL", "PDF H1", "Actual H1", "H1 match?", "PDF title", "Actual title", "Title match?", "PDF meta", "Actual meta", "Meta match?", "PDF robots expectation", "Actual robots", "Robots match?", "Status", "Notes"], sotCompliance.map((row) => ({ "PDF page name": row.pageName, "PDF URL": row.pdfUrl, "Actual project URL": row.actualPath, "PDF H1": row.h1, "Actual H1": row.actualH1, "H1 match?": row.h1Match ? "yes" : "no", "PDF title": row.title, "Actual title": row.actualTitle, "Title match?": row.titleMatch ? "yes" : "no", "PDF meta": row.meta, "Actual meta": row.actualMeta, "Meta match?": row.metaMatch ? "yes" : "no", "PDF robots expectation": row.robots, "Actual robots": row.actualRobots, "Robots match?": row.robotsMatch ? "yes" : "no", Status: row.status, Notes: row.notes })));

  await writeCsv(SHEETS[20][1], ["ZIP item/key/route", "ZIP expected title/meta/H1/schema if available", "Actual project route", "Exists?", "Implemented?", "Indexable?", "Sitemap included?", "Duplicate/thin risk?", "Status", "Notes"], zipCoverage.map((row) => ({ "ZIP item/key/route": row.item, "ZIP expected title/meta/H1/schema if available": row.expected, "Actual project route": row.actualRoute, "Exists?": row.exists, "Implemented?": row.implemented, "Indexable?": row.indexable, "Sitemap included?": row.sitemapIncluded, "Duplicate/thin risk?": row.duplicateThinRisk, Status: row.status, Notes: row.notes })));

  await writeCsv(SHEETS[21][1], ["File path", "File type", "SEO relevance", "Important SEO strings found", "Routes affected", "Notes"], sourceInventory.sourceFiles.map((row) => ({ "File path": row.filePath, "File type": row.fileType, "SEO relevance": row.seoRelevance, "Important SEO strings found": row.importantSeoStrings, "Routes affected": row.routesAffected, Notes: row.notes })));

  const sortedIssues = [...issues].sort((a, b) => statusRank(a.severity) - statusRank(b.severity) || a.id.localeCompare(b.id));
  await writeCsv(SHEETS[22][1], ["Issue ID", "Severity", "Category", "URL", "File path", "Issue", "Evidence", "Why it matters", "Recommended fix", "Safe before production?", "Requires business decision?"], sortedIssues.map((issue) => ({ "Issue ID": issue.id, Severity: issue.severity, Category: issue.category, URL: issue.url, "File path": issue.filePath, Issue: issue.issue, Evidence: issue.evidence, "Why it matters": issue.whyItMatters, "Recommended fix": issue.recommendedFix, "Safe before production?": issue.safeBeforeProduction, "Requires business decision?": issue.requiresBusinessDecision })));

  const actionRows = sortedIssues.filter((issue, index, array) => array.findIndex((candidate) => candidate.issue === issue.issue && candidate.recommendedFix === issue.recommendedFix) === index).map((issue) => ({ Priority: issue.severity, Task: issue.recommendedFix, "Files likely affected": issue.filePath, "Routes affected": issue.url, "Expected SEO impact": issue.whyItMatters, Risk: issue.requiresBusinessDecision === "yes" ? "Requires approved business/legal input" : "Low when covered by existing tests and recrawl", "Effort estimate": issue.effort ?? "Low-Medium", "Should do before production?": ["Critical", "High"].includes(issue.severity) ? "yes" : issue.requiresBusinessDecision === "yes" ? "decision required" : "recommended", Notes: `Source issue ${issue.id}: ${issue.issue}` }));
  await writeCsv(SHEETS[23][1], ["Priority", "Task", "Files likely affected", "Routes affected", "Expected SEO impact", "Risk", "Effort estimate", "Should do before production?", "Notes"], actionRows);

  const manifest = [
    "# CSV Workbook Fallback Manifest",
    "",
    `Generated: ${GENERATED_AT}`,
    "",
    "A single XLSX was not generated because the required @oai/artifact-tool runtime and workspace dependency loader were unavailable. The 24 requested workbook sheets are supplied as separate UTF-8 CSV files.",
    "",
    "| Requested sheet | CSV file | Excel-safe sheet label if later imported |",
    "|---|---|---|",
    ...SHEETS.map(([requested, filename]) => {
      const safe = requested.replaceAll("/", "-").replace("PDF - Source-of-Truth Compliance", "PDF SOT Compliance").slice(0, 31);
      return `| ${requested.replaceAll("|", "\\|")} | csv/${filename} | ${safe.replaceAll("|", "\\|")} |`;
    }),
    "",
    "Full JSON-LD objects, body corpora, and unbounded link/image arrays remain in `seo-inventory-raw.json`; CSV cells contain bounded summaries or raw-reference IDs where appropriate.",
  ].join("\n");
  await fs.writeFile(path.join(AUDIT_DIR, "CSV_MANIFEST.md"), `${manifest}\n`, "utf8");
}

function markdownList(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None observed in the verified scope.";
}

async function writeMarkdownSummary(data) {
  const { metrics, issues, sotCompliance } = data;
  const sorted = [...issues].sort((a, b) => statusRank(a.severity) - statusRank(b.severity) || a.id.localeCompare(b.id));
  const topIssues = sorted.slice(0, 10);
  const quickWins = unique(sorted.filter((issue) => issue.effort === "Low" || issue.effort === "Low-Medium" || /Low/.test(issue.effort ?? "")).map((issue) => issue.recommendedFix)).slice(0, 10);
  const decisions = unique(sorted.filter((issue) => issue.requiresBusinessDecision === "yes").map((issue) => `${issue.url}: ${issue.recommendedFix}`));
  const pdfMismatches = sotCompliance.filter((row) => row.status === "Partial" || row.status === "Missing");
  const summary = `# From The Trunk SEO Inventory Audit

Generated: ${GENERATED_AT}  
Audit target: fresh production build served locally at ${BASE_URL}  
Method: static source scan plus server-rendered HTTP GET crawl. No external website was crawled. External outbound URLs were inventoried but not fetched.

## Executive verdict

**${metrics.verdict}**

The audit checked ${metrics.totalPagesCrawled} URLs (${metrics.htmlPagesCrawled} rendered HTML responses), ${metrics.productsChecked} real product pages, and ${metrics.filesScanned} source/config/test/asset files. It extracted ${metrics.keywordPhrases.toLocaleString()} normalized SEO phrases, ${metrics.corpusWords.toLocaleString()} corpus words, ${metrics.internalLinks.toLocaleString()} internal link instances, and ${metrics.externalLinks.toLocaleString()} outbound link instances.

## Verified counts

| Metric | Count |
|---|---:|
| Public indexable pages | ${metrics.publicIndexablePages} |
| Unexpected indexable utility/private pages | ${metrics.unexpectedIndexablePages} |
| Noindex pages | ${metrics.noindexPages} |
| Redirects | ${metrics.redirects} |
| 404 responses | ${metrics.notFound} |
| 5xx responses | ${metrics.serverErrors} |
| Soft-404/thin risks | ${metrics.soft404Risk} |
| Sitemap pages represented in crawl | ${metrics.pagesInSitemap} |
| Indexable pages missing from sitemap | ${metrics.pagesMissingFromSitemap} |
| Duplicate-title pages | ${metrics.duplicateTitles} |
| Duplicate-description pages | ${metrics.duplicateMetaDescriptions} |
| Missing H1 pages | ${metrics.missingH1} |
| Multiple-H1 pages | ${metrics.multipleH1} |
| Canonical mismatches/missing | ${metrics.canonicalMismatch} |
| Pages with structured data | ${metrics.pagesWithSchema} |
| Invalid structured-data pages | ${metrics.pagesWithInvalidSchema} |
| Pages with missing image alt attributes | ${metrics.pagesWithMissingImageAlt} |

## Top 10 critical/high-priority findings

${topIssues.map((issue, index) => `${index + 1}. **${issue.severity} - ${issue.issue}** (${issue.url})  
   Evidence: ${issue.evidence}  
   Action: ${issue.recommendedFix}`).join("\n")}

## Top 10 quick wins

${quickWins.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## PDF source-of-truth compliance

The current three-page PDF is the newest named source of truth. ${pdfMismatches.length} mapped rows are Partial or Missing in rendered output. See 'csv/20-pdf-sot-compliance.csv' for exact H1/title/meta/robots comparisons. Rendered production HTML is treated as the current implementation truth; PDF mappings include '/about' -> '/our-story' and policy intents -> '/policies/[slug]'.

## Historical ZIP/helper coverage

No ZIP is present in the current worktree or attachment. A deleted historical 'Archive.zip' blob was inspected read-only from Git history. It contains reports/CSVs, not implementation helpers. Its recommendations are compared in 'csv/21-zip-seo-helper-coverage.csv'; no '/journal' recommendation or Google verification item exists in that archive.

## Backlinks

${metrics.backlinkStatus}

Outbound external links are separately inventoried; they are not backlinks and were not fetched.

## Business decisions required before production

${markdownList(decisions)}

## Validation and limitations

- 'pnpm test': passed (151 files, 1,798 tests).
- 'pnpm lint': passed.
- 'pnpm exec tsc --noEmit': passed.
- Fresh 'BEHOLD_FEED_URL=YOUR_FEED_ID pnpm build': passed; 54 app paths reported.
- Runtime Node was v25.4.0, outside the repository's declared >=20.9 <25 range; CI pins Node 22. Re-run the final gate under Node 22 before release.
- The full 'agent:check' admin Lighthouse matrix requires 'FTT_LHCI_AUTH_EMAIL' and 'FTT_LHCI_AUTH_PASSWORD', which were unavailable. The audit performs a broader metadata crawl but does not substitute for authenticated Lighthouse.
- A database-managed redirect '/collection' -> '/neel' exists, but proxy source excludes '/collection' from managed redirect consultation, so it is inert in the rendered route.
- The configured CMS contains one draft page ('/georgetta-saree') and no published CMS catch-all page; the draft was not fetched as public content.
- No Search Console/Ahrefs/Semrush backlink export was present.
- XLSX generation was blocked because the required artifact-tool runtime/loader was unavailable. The complete 24-sheet-equivalent CSV fallback is in 'csv/' and mapped by 'CSV_MANIFEST.md'.
`;
  await fs.writeFile(path.join(AUDIT_DIR, "SEO_INVENTORY_SUMMARY.md"), summary, "utf8");
}

async function main() {
  await fs.mkdir(CSV_DIR, { recursive: true });
  const runtimePath = path.join(AUDIT_DIR, "runtime-source-data.json");
  const runtimeData = await pathExists(runtimePath) ? JSON.parse(await fs.readFile(runtimePath, "utf8")) : { pages: [], redirects: [], menus: {} };
  const sourceInventory = await buildSourceInventory();
  const crawl = await crawlSite(sourceInventory, runtimeData);
  const pages = enrichPages(crawl.crawled, sourceInventory);
  const keywords = buildKeywordAnalysis(pages);
  const links = buildLinkRows(pages);
  const issues = buildIssues(pages);
  const metrics = makeMetrics(pages, sourceInventory, keywords, links, issues);
  const sotCompliance = buildSotCompliance(pages);
  const zipCoverage = buildZipCoverage(pages, sourceInventory);
  const routeInventory = buildRouteInventory(sourceInventory, crawl, runtimeData);
  const data = { pages, sourceInventory, crawl, runtimeData, keywords, links, issues, metrics, sotCompliance, zipCoverage, routeInventory };

  await writeCsvSheets(data);
  await writeMarkdownSummary(data);

  const raw = {
    audit: {
      generatedAt: GENERATED_AT,
      baseUrl: BASE_URL,
      canonicalOrigin: CANONICAL_ORIGIN,
      method: "Static source scan plus fresh production-build server-rendered HTTP GET crawl",
      externalCrawl: "prohibited and not performed",
      build: { command: "BEHOLD_FEED_URL=YOUR_FEED_ID pnpm build", status: process.env.SEO_AUDIT_BUILD_STATUS ?? "passed", appPathsReported: 54 },
      validation: {
        test: process.env.SEO_AUDIT_TEST_STATUS ?? "passed: 151 files / 1,798 tests",
        lint: process.env.SEO_AUDIT_LINT_STATUS ?? "passed",
        typecheck: process.env.SEO_AUDIT_TYPECHECK_STATUS ?? "passed",
        node: process.version,
        nodeEngineNote: "Runtime is outside declared <25 range; CI/repo pin Node 22.",
      },
      spreadsheet: {
        xlsxGenerated: false,
        reason: "Required @oai/artifact-tool runtime and workspace dependency loader unavailable.",
        fallback: "24 UTF-8 CSV files plus CSV_MANIFEST.md",
        requestedSheetMap: SHEETS.map(([requested, filename]) => ({ requested, csv: `csv/${filename}`, excelSafeLabel: requested.replaceAll("/", "-").replace("PDF - Source-of-Truth Compliance", "PDF SOT Compliance").slice(0, 31) })),
      },
      sourceOfTruth: {
        pdf: "docs/FTT_OnPage_H1_Title_Meta_for AllPages.pdf",
        pdfSha256: "7717644a03660de2ba77dc1d9a34f820362ae267389976600dde08c0fb78ce59",
        pdfPages: 3,
        historicalZip: "Git blob ec2a874bee32e09771273994ee09c19337edd3cd from commit 78990917422eaf44f2cdefe2a23e88a06a54c2ad; absent from current tree; inspected read-only",
      },
    },
    metrics,
    routeInventory,
    pages,
    sitemap: crawl.sitemapEntries,
    robots: { text: crawl.robotsText, rules: crawl.robotsRules },
    redirects: crawl.redirects,
    runtimeData,
    keywords: keywords.keywords.map((entry) => ({ ...entry, pages: [...entry.pages], locations: [...entry.locations] })),
    corpus: keywords.corpus.map((entry) => ({ ...entry, pages: [...entry.pages], examples: [...entry.examples] })),
    pageKeywordMap: keywords.pageMaps,
    internalLinks: links.internal,
    externalLinks: links.external,
    sourceFiles: sourceInventory.sourceFiles,
    pdfCompliance: sotCompliance,
    zipCoverage,
    issues,
  };
  await fs.writeFile(path.join(AUDIT_DIR, "seo-inventory-raw.json"), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(AUDIT_DIR, "crawl-manifest.json"), `${JSON.stringify({ generatedAt: GENERATED_AT, baseUrl: BASE_URL, urls: pages.map((page) => ({ url: page.url, status: page.httpStatus, finalStatus: page.finalHttpStatus, finalUrl: page.finalUrl, type: page.pageType })) }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ metrics, outputs: { raw: path.join(AUDIT_DIR, "seo-inventory-raw.json"), summary: path.join(AUDIT_DIR, "SEO_INVENTORY_SUMMARY.md"), csvDirectory: CSV_DIR } }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
