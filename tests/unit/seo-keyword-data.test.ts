import { describe, expect, it } from "vitest";

import {
  analyzeKeywordData,
  parseGa4Csv,
  parseKeywordMapCsv,
  parseKeywordPlannerCsv,
  parseSearchConsoleCsv,
  renderKeywordOpportunityReport,
} from "@/lib/seo/keyword-data";

describe("SEO keyword data import", () => {
  it("parses Search Console CSV exports with normalized paths and CTR values", () => {
    const rows = parseSearchConsoleCsv(
      [
        "query,page,clicks,impressions,ctr,position,country,device",
        "pre loved silk saree,https://www.fromthetrunk.shop/collection/fabric/silk,2,200,1%,12.5,IND,mobile",
      ].join("\n"),
    );

    expect(rows).toEqual([
      {
        clicks: 2,
        country: "IND",
        ctr: 0.01,
        device: "mobile",
        impressions: 200,
        page: "/collection/fabric/silk",
        position: 12.5,
        query: "pre loved silk saree",
      },
    ]);
  });

  it("parses Keyword Planner and GA4 CSV exports without requiring them at build time", () => {
    const planner = parseKeywordPlannerCsv(
      [
        "keyword,avg monthly searches,competition,top of page bid low,top of page bid high",
        "sell old sarees online,500,Medium,10,40",
      ].join("\n"),
    );
    const ga4 = parseGa4Csv(
      [
        "landing page,sessions,engaged sessions,add_to_cart,checkout_start,purchase,revenue",
        "/sell-your-saree,30,20,0,0,0,0",
      ].join("\n"),
    );

    expect(planner[0]?.avgMonthlySearches).toBe(500);
    expect(planner[0]?.competition).toBe("Medium");
    expect(ga4[0]?.landingPage).toBe("/sell-your-saree");
    expect(ga4[0]?.engagedSessions).toBe(20);
  });

  it("chooses title/content/noindex actions from real imported metrics", () => {
    const keywordMap = parseKeywordMapCsv(
      [
        "keyword,target_page,priority,status,index_policy",
        "pre loved silk saree,/collection/fabric/silk,P0,created,index",
        "pre loved chiffon saree,/collection/fabric/chiffon,P1,created noindex,noindex until 3 products",
        "sell old sarees online,/sell-your-saree,P0,created,index",
      ].join("\n"),
    );
    const searchConsole = parseSearchConsoleCsv(
      [
        "query,page,clicks,impressions,ctr,position",
        "pre loved silk saree,/collection/fabric/silk,1,250,0.4%,11",
        "sell old sarees online,/sell-your-saree,5,80,6.25%,9",
        "pre loved chiffon saree,/collection/fabric/chiffon,0,20,0%,30",
      ].join("\n"),
    );

    const opportunities = analyzeKeywordData({ keywordMap, searchConsole });
    const silk = opportunities.find((item) => item.keyword === "pre loved silk saree");
    const sell = opportunities.find((item) => item.keyword === "sell old sarees online");
    const chiffon = opportunities.find(
      (item) => item.keyword === "pre loved chiffon saree",
    );

    expect(silk?.action).toBe("improve title");
    expect(sell?.action).toBe("improve content");
    expect(chiffon?.action).toBe("noindex");
  });

  it("renders a markdown report without fabricated volume numbers", () => {
    const opportunities = analyzeKeywordData({
      keywordMap: [
        {
          indexPolicy: "index",
          keyword: "what is a pre loved saree",
          priority: "P0",
          status: "created",
          targetPage: "/guides/what-is-a-pre-loved-saree",
        },
      ],
    });

    const report = renderKeywordOpportunityReport(opportunities, {
      generatedAt: new Date("2026-06-28T00:00:00.000Z"),
      notes: ["Missing optional input: data/seo/gsc.csv"],
    });

    expect(report).toContain("what is a pre loved saree");
    expect(report).toContain("Missing optional input: data/seo/gsc.csv");
    expect(report).toContain("empty metrics mean no export data was provided");
  });
});
