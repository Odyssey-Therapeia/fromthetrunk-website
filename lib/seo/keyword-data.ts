import { keywordLandingPages } from "@/lib/seo/keyword-landing-pages";

export type SearchConsoleMetric = {
  clicks: number;
  country: string;
  ctr: number;
  device: string;
  impressions: number;
  page: string;
  position: number;
  query: string;
};

export type KeywordPlannerMetric = {
  avgMonthlySearches: number;
  competition: string;
  keyword: string;
  topOfPageBidHigh: number;
  topOfPageBidLow: number;
};

export type Ga4LandingMetric = {
  addToCart: number;
  checkoutStart: number;
  engagedSessions: number;
  landingPage: string;
  purchase: number;
  revenue: number;
  sessions: number;
};

export type KeywordMapEntry = {
  canonicalUrl?: string;
  indexPolicy?: string;
  keyword: string;
  priority?: string;
  status?: string;
  targetPage: string;
  volumeSource?: string;
};

export type KeywordOpportunity = {
  action: KeywordOpportunityAction;
  avgMonthlySearches: number | null;
  avgPosition: number | null;
  clicks: number;
  ctr: number | null;
  engagedSessions: number;
  impressions: number;
  indexPolicy: string;
  keyword: string;
  mappedPage: string;
  priorityScore: number;
  purchases: number;
  revenue: number;
  source: string;
};

export type KeywordOpportunityAction =
  | "improve title"
  | "improve content"
  | "add internal links"
  | "build new page"
  | "defer"
  | "noindex"
  | "not relevant";

export type KeywordAnalysisInput = {
  ga4?: Ga4LandingMetric[];
  keywordMap?: KeywordMapEntry[];
  planner?: KeywordPlannerMetric[];
  searchConsole?: SearchConsoleMetric[];
};

const HIGH_IMPRESSION_THRESHOLD = 100;
const LOW_CTR_THRESHOLD = 0.02;

export function parseCsvRecords(csv: string): Array<Record<string, string>> {
  const rows = parseCsvRows(csv).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() ?? "";
    });
    return record;
  });
}

export function parseSearchConsoleCsv(csv: string): SearchConsoleMetric[] {
  return parseCsvRecords(csv).map((record) => ({
    query: readField(record, ["query", "searchterm", "keyword"]),
    page: normalizePath(
      readField(record, ["page", "landingpage", "url", "pagepath"]),
    ),
    clicks: parseMetricNumber(readField(record, ["clicks"])),
    impressions: parseMetricNumber(readField(record, ["impressions"])),
    ctr: parsePercentage(readField(record, ["ctr"])),
    position: parseMetricNumber(
      readField(record, ["position", "avgposition", "averageposition"]),
    ),
    country: readField(record, ["country"]),
    device: readField(record, ["device"]),
  }));
}

export function parseKeywordPlannerCsv(csv: string): KeywordPlannerMetric[] {
  return parseCsvRecords(csv).map((record) => ({
    keyword: readField(record, ["keyword", "query"]),
    avgMonthlySearches: parseMetricNumber(
      readField(record, [
        "avgmonthlysearches",
        "averagemonthlysearches",
        "avgmonthlysearch",
        "searches",
      ]),
    ),
    competition: readField(record, ["competition"]),
    topOfPageBidLow: parseMetricNumber(
      readField(record, ["topofpagebidlow", "topofpagebidlowrange"]),
    ),
    topOfPageBidHigh: parseMetricNumber(
      readField(record, ["topofpagebidhigh", "topofpagebidhighrange"]),
    ),
  }));
}

export function parseGa4Csv(csv: string): Ga4LandingMetric[] {
  return parseCsvRecords(csv).map((record) => ({
    landingPage: normalizePath(
      readField(record, ["landingpage", "pagepath", "page", "url"]),
    ),
    sessions: parseMetricNumber(readField(record, ["sessions"])),
    engagedSessions: parseMetricNumber(
      readField(record, ["engagedsessions", "engagedsession"]),
    ),
    addToCart: parseMetricNumber(
      readField(record, ["addtocart", "add_to_cart", "addtocarts"]),
    ),
    checkoutStart: parseMetricNumber(
      readField(record, ["checkoutstart", "checkout_start", "begincheckout"]),
    ),
    purchase: parseMetricNumber(
      readField(record, ["purchase", "purchases", "transactions"]),
    ),
    revenue: parseMetricNumber(readField(record, ["revenue", "totalrevenue"])),
  }));
}

export function parseKeywordMapCsv(csv: string): KeywordMapEntry[] {
  return parseCsvRecords(csv)
    .map((record) => ({
      keyword: readField(record, ["keyword", "query"]),
      targetPage: normalizePath(
        readField(record, ["targetpage", "target_page", "page"]),
      ),
      priority: readField(record, ["priority"]),
      status: readField(record, ["status"]),
      canonicalUrl: readField(record, ["canonicalurl", "canonical_url"]),
      indexPolicy: readField(record, ["indexpolicy", "index_policy"]),
      volumeSource: readField(record, ["volumesource", "volume_source"]),
    }))
    .filter((entry) => entry.keyword && entry.targetPage);
}

export function analyzeKeywordData(
  input: KeywordAnalysisInput,
): KeywordOpportunity[] {
  const keywordMap = buildKeywordMap(input.keywordMap ?? []);
  const plannerByKeyword = new Map(
    (input.planner ?? []).map((row) => [normalizeKeyword(row.keyword), row]),
  );
  const ga4ByPage = groupGa4ByPage(input.ga4 ?? []);
  const searchRows = input.searchConsole ?? [];
  const searchKeywords = new Set(
    searchRows.map((row) => normalizeKeyword(row.query)).filter(Boolean),
  );
  const plannerKeywords = new Set(
    (input.planner ?? [])
      .map((row) => normalizeKeyword(row.keyword))
      .filter(Boolean),
  );
  const allKeywords = new Set([
    ...Array.from(keywordMap.keys()),
    ...Array.from(searchKeywords),
    ...Array.from(plannerKeywords),
  ]);

  return Array.from(allKeywords)
    .map((keywordKey) => {
      const mapped = keywordMap.get(keywordKey);
      const matchingSearchRows = searchRows.filter(
        (row) => normalizeKeyword(row.query) === keywordKey,
      );
      const planner = plannerByKeyword.get(keywordKey);
      const mappedPage = mapped?.targetPage ?? inferPageForKeyword(keywordKey);
      const ga4 = ga4ByPage.get(mappedPage);
      const impressions = sum(matchingSearchRows.map((row) => row.impressions));
      const clicks = sum(matchingSearchRows.map((row) => row.clicks));
      const avgPosition =
        matchingSearchRows.length > 0
          ? weightedAverage(
              matchingSearchRows.map((row) => ({
                value: row.position,
                weight: Math.max(row.impressions, 1),
              })),
            )
          : null;
      const ctr = impressions > 0 ? clicks / impressions : null;
      const avgMonthlySearches = planner?.avgMonthlySearches ?? null;
      const source = [
        matchingSearchRows.length > 0 ? "GSC" : null,
        planner ? "Keyword Planner" : null,
        mapped ? "Keyword Map" : null,
      ]
        .filter(Boolean)
        .join(" + ");

      const opportunity: KeywordOpportunity = {
        action: "defer",
        avgMonthlySearches,
        avgPosition,
        clicks,
        ctr,
        engagedSessions: ga4?.engagedSessions ?? 0,
        impressions,
        indexPolicy: mapped?.indexPolicy ?? inferIndexPolicy(mappedPage),
        keyword: keywordKey,
        mappedPage,
        priorityScore: scoreOpportunity({
          avgMonthlySearches,
          avgPosition,
          clicks,
          ctr,
          impressions,
          priority: mapped?.priority,
        }),
        purchases: ga4?.purchase ?? 0,
        revenue: ga4?.revenue ?? 0,
        source: source || "Unmapped input",
      };

      return {
        ...opportunity,
        action: chooseAction(opportunity, mapped),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function renderKeywordOpportunityReport(
  opportunities: KeywordOpportunity[],
  options: { generatedAt?: Date; notes?: string[] } = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();
  const notes = options.notes ?? [];
  const rows = opportunities.map((item) =>
    [
      item.keyword,
      item.mappedPage,
      item.impressions,
      item.clicks,
      formatPercent(item.ctr),
      formatNumber(item.avgPosition),
      item.avgMonthlySearches ?? "",
      item.priorityScore,
      item.indexPolicy,
      item.action,
      item.source,
    ].join(" | "),
  );

  return [
    "# SEO Keyword Opportunity Report",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "This report is generated from local Search Console, Keyword Planner, GA4, and seed keyword-map CSV files. It does not invent search volume; empty metrics mean no export data was provided for that field.",
    "",
    ...(notes.length > 0
      ? ["## Input Notes", "", ...notes.map((note) => `- ${note}`), ""]
      : []),
    "## Opportunities",
    "",
    "| Keyword | Mapped page | Impressions | Clicks | CTR | Avg position | Avg monthly searches | Priority score | Index policy | Action | Source |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
    "## Action Rules",
    "",
    "- Position 8-20: improve content and internal links.",
    "- High impressions with low CTR: improve title/meta, then retest in Search Console.",
    "- Indexed seed pages with low data: keep monitoring; do not create more pages from zero-volume assumptions.",
    "- Noindex/deferred pages: keep noindex until product count or expert content supports indexing.",
    "- Unmapped but relevant keywords: review manually before building a new page.",
  ].join("\n");
}

function buildKeywordMap(entries: KeywordMapEntry[]) {
  const map = new Map<string, KeywordMapEntry>();

  for (const page of keywordLandingPages) {
    const entry: KeywordMapEntry = {
      canonicalUrl: undefined,
      indexPolicy: page.sitemap || page.indexableWithoutProducts ? "index" : "noindex",
      keyword: page.primaryKeyword,
      priority: "P0",
      status: "configured",
      targetPage: page.canonicalPath,
      volumeSource: "Seed",
    };
    map.set(normalizeKeyword(page.primaryKeyword), entry);
    for (const keyword of page.secondaryKeywords) {
      map.set(normalizeKeyword(keyword), {
        ...entry,
        keyword,
        priority: "P1",
      });
    }
  }

  for (const entry of entries) {
    map.set(normalizeKeyword(entry.keyword), entry);
  }

  return map;
}

function chooseAction(
  opportunity: KeywordOpportunity,
  mapped?: KeywordMapEntry,
): KeywordOpportunityAction {
  const indexPolicy = opportunity.indexPolicy.toLowerCase();
  const status = mapped?.status?.toLowerCase() ?? "";

  if (indexPolicy.includes("noindex") || indexPolicy.includes("defer")) {
    return "noindex";
  }
  if (status.includes("needs new page")) {
    return "build new page";
  }
  if (!mapped && opportunity.impressions === 0 && !opportunity.avgMonthlySearches) {
    return "not relevant";
  }
  if (
    opportunity.impressions >= HIGH_IMPRESSION_THRESHOLD &&
    opportunity.ctr !== null &&
    opportunity.ctr < LOW_CTR_THRESHOLD
  ) {
    return "improve title";
  }
  if (
    opportunity.avgPosition !== null &&
    opportunity.avgPosition >= 8 &&
    opportunity.avgPosition <= 20
  ) {
    return "improve content";
  }
  if (opportunity.impressions > 0 && opportunity.clicks === 0) {
    return "add internal links";
  }
  return "defer";
}

function scoreOpportunity(input: {
  avgMonthlySearches: number | null;
  avgPosition: number | null;
  clicks: number;
  ctr: number | null;
  impressions: number;
  priority?: string;
}) {
  const priorityBoost =
    input.priority === "P0" ? 30 : input.priority === "P1" ? 15 : 5;
  const impressionScore = Math.min(input.impressions / 10, 40);
  const volumeScore =
    input.avgMonthlySearches !== null
      ? Math.min(input.avgMonthlySearches / 100, 30)
      : 0;
  const positionScore =
    input.avgPosition !== null && input.avgPosition >= 8 && input.avgPosition <= 20
      ? 20
      : 0;
  const ctrScore =
    input.impressions > 0 && input.ctr !== null && input.ctr < LOW_CTR_THRESHOLD
      ? 15
      : 0;
  const clickPenalty = input.clicks === 0 && input.impressions > 0 ? 5 : 0;

  return Math.round(
    priorityBoost + impressionScore + volumeScore + positionScore + ctrScore + clickPenalty,
  );
}

function groupGa4ByPage(rows: Ga4LandingMetric[]) {
  const map = new Map<string, Ga4LandingMetric>();
  for (const row of rows) {
    const existing = map.get(row.landingPage);
    map.set(row.landingPage, {
      landingPage: row.landingPage,
      sessions: (existing?.sessions ?? 0) + row.sessions,
      engagedSessions: (existing?.engagedSessions ?? 0) + row.engagedSessions,
      addToCart: (existing?.addToCart ?? 0) + row.addToCart,
      checkoutStart: (existing?.checkoutStart ?? 0) + row.checkoutStart,
      purchase: (existing?.purchase ?? 0) + row.purchase,
      revenue: (existing?.revenue ?? 0) + row.revenue,
    });
  }
  return map;
}

function inferPageForKeyword(keyword: string) {
  if (keyword.includes("sell") || keyword.includes("consign")) {
    return "/sell-your-saree";
  }
  if (keyword.includes("silk")) return "/collection/fabric/silk";
  if (keyword.includes("festive") || keyword.includes("party")) {
    return "/collection/occasion/festive";
  }
  if (keyword.includes("meaning") || keyword.includes("what is")) {
    return "/guides/what-is-a-pre-loved-saree";
  }
  if (keyword.includes("second hand")) {
    return "/guides/pre-loved-vs-second-hand-saree";
  }
  return "/collection";
}

function inferIndexPolicy(path: string) {
  const page = keywordLandingPages.find((entry) => entry.canonicalPath === path);
  if (!page) return "manual review";
  return page.sitemap || page.indexableWithoutProducts ? "index" : "noindex";
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.pathname || "/";
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}

function readField(record: Record<string, string>, names: string[]) {
  for (const name of names.map(normalizeHeader)) {
    const value = record[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function parseMetricNumber(value: string) {
  if (!value) return 0;
  const normalized = value.replace(/[₹$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercentage(value: string) {
  if (!value) return 0;
  const parsed = parseMetricNumber(value);
  return value.includes("%") ? parsed / 100 : parsed;
}

function weightedAverage(items: Array<{ value: number; weight: number }>) {
  const totalWeight = sum(items.map((item) => item.weight));
  if (totalWeight === 0) return 0;
  return (
    sum(items.map((item) => item.value * item.weight)) / totalWeight
  );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatPercent(value: number | null) {
  if (value === null) return "";
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number | null) {
  if (value === null) return "";
  return value.toFixed(1);
}
