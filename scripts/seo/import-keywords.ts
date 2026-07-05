import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  analyzeKeywordData,
  parseGa4Csv,
  parseKeywordMapCsv,
  parseKeywordPlannerCsv,
  parseSearchConsoleCsv,
  renderKeywordOpportunityReport,
} from "@/lib/seo/keyword-data";

type CliOptions = {
  ga4Path: string;
  gscPath: string;
  keywordMapPath: string;
  outputPath: string;
  plannerPath: string;
};

const DEFAULT_INPUT_DIR = "data/seo";

function main() {
  const options = parseArgs(process.argv.slice(2));
  const notes: string[] = [];

  const keywordMapCsv = readOptionalFile(options.keywordMapPath, notes);
  const gscCsv = readOptionalFile(options.gscPath, notes);
  const plannerCsv = readOptionalFile(options.plannerPath, notes);
  const ga4Csv = readOptionalFile(options.ga4Path, notes);

  const opportunities = analyzeKeywordData({
    ga4: ga4Csv ? parseGa4Csv(ga4Csv) : [],
    keywordMap: keywordMapCsv ? parseKeywordMapCsv(keywordMapCsv) : [],
    planner: plannerCsv ? parseKeywordPlannerCsv(plannerCsv) : [],
    searchConsole: gscCsv ? parseSearchConsoleCsv(gscCsv) : [],
  });

  const report = renderKeywordOpportunityReport(opportunities, { notes });
  const outputDir = path.dirname(options.outputPath);
  if (outputDir && outputDir !== ".") mkdirSync(outputDir, { recursive: true });
  writeFileSync(options.outputPath, report);

  console.log(`Wrote ${options.outputPath}`);
  console.log(`Analyzed ${opportunities.length} keyword opportunities.`);
}

function parseArgs(args: string[]): CliOptions {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    flags.set(arg.slice(2), args[index + 1] ?? "");
    index += 1;
  }

  return {
    ga4Path: flags.get("ga4") ?? path.join(DEFAULT_INPUT_DIR, "ga4-organic.csv"),
    gscPath: flags.get("gsc") ?? path.join(DEFAULT_INPUT_DIR, "gsc.csv"),
    keywordMapPath: flags.get("keyword-map") ?? "SEO_KEYWORD_MAP.csv",
    outputPath: flags.get("out") ?? "SEO_KEYWORD_OPPORTUNITY_REPORT.md",
    plannerPath:
      flags.get("planner") ?? path.join(DEFAULT_INPUT_DIR, "keyword-planner.csv"),
  };
}

function readOptionalFile(filePath: string, notes: string[]) {
  if (!existsSync(filePath)) {
    notes.push(`Missing optional input: ${filePath}`);
    return "";
  }
  notes.push(`Loaded input: ${filePath}`);
  return readFileSync(filePath, "utf8");
}

main();
