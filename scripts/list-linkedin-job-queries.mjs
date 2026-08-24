import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const canonicalDirections = new Set([
  "Quant",
  "AI/ML",
  "ML Systems",
  "SWE/Data Infra",
]);

export function buildLinkedInJobQueryPlan(config, source, now = new Date()) {
  const maxQueriesPerRun = config.maxQueriesPerRun ?? 10;
  const resultsPerQuery = config.resultsPerQuery ?? 20;

  if (!Number.isInteger(maxQueriesPerRun) || maxQueriesPerRun < 1 || maxQueriesPerRun > 10) {
    throw new Error("LinkedIn maxQueriesPerRun must be an integer from 1 through 10.");
  }
  if (!Number.isInteger(resultsPerQuery) || resultsPerQuery < 1 || resultsPerQuery > 20) {
    throw new Error("LinkedIn resultsPerQuery must be an integer from 1 through 20.");
  }

  const queries = (config.queries ?? []).slice(0, maxQueriesPerRun).map((query) => {
    if (!query.id || !query.keywords) throw new Error("Every LinkedIn query needs an id and keywords.");
    if ((query.directionHints ?? []).some((direction) => !canonicalDirections.has(direction))) {
      throw new Error(`LinkedIn query ${query.id} has a non-canonical direction hint.`);
    }
    return {
      id: query.id,
      keywords: query.keywords,
      location: config.location,
      employmentType: config.employmentType,
      resultsLimit: resultsPerQuery,
      directionHints: query.directionHints ?? [],
    };
  });

  return {
    generatedAt: now.toISOString(),
    platform: config.platform,
    publicSearchUrl: config.publicSearchUrl,
    sourceStatus: source?.status ?? "needs-review",
    backend: source?.backend ?? "linkedin-scraper-mcp",
    discoveryOnly: true,
    officialEmployerPageRequired: true,
    directionHintsRequireOfficialVerification: true,
    baselineEntryCount: source?.baseline?.entryCount ?? 0,
    maxQueriesPerRun,
    resultsPerQuery,
    queries,
  };
}

async function main() {
  const [configText, stateText] = await Promise.all([
    readFile(new URL("../data/linkedin-job-searches.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(configText);
  const state = JSON.parse(stateText);
  const source = state.sourceMonitoring.sources["linkedin-jobs"];
  console.log(JSON.stringify(buildLinkedInJobQueryPlan(config, source), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
