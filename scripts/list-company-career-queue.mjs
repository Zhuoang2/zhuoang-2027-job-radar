import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function buildCompanyCareerQueue(jobs, source, now = new Date(), seeds = []) {
  const baseline = source?.baseline ?? {};
  const companyStates = baseline.companyStates ?? {};
  const deferred = new Set(
    (baseline.deferredLargeCompanies ?? []).map((entry) => entry.company),
  );
  const companies = new Map();

  for (const job of jobs) {
    const current = companies.get(job.company) ?? {
      company: job.company,
      activeCardCount: 0,
      directions: new Set(),
    };
    current.activeCardCount += 1;
    for (const direction of job.directions ?? []) current.directions.add(direction);
    companies.set(job.company, current);
  }

  for (const seed of seeds) {
    const current = companies.get(seed.company) ?? {
      company: seed.company,
      activeCardCount: 0,
      directions: new Set(),
      publicCareersUrl: seed.publicCareersUrl ?? null,
    };
    for (const direction of seed.directions ?? []) current.directions.add(direction);
    current.publicCareersUrl ??= seed.publicCareersUrl ?? null;
    companies.set(seed.company, current);
  }

  const dueCompanies = [...companies.values()]
    .filter(({ company }) => !deferred.has(company))
    .map((entry) => {
      const prior = companyStates[entry.company] ?? {};
      const nextDueAt = prior.nextDueAt ? new Date(prior.nextDueAt) : null;
      return {
        company: entry.company,
        activeCardCount: entry.activeCardCount,
        directions: [...entry.directions].sort(),
        publicCareersUrl: prior.publicCareersUrl ?? entry.publicCareersUrl ?? null,
        lastSuccessfulCheckAt: prior.lastSuccessfulCheckAt ?? null,
        nextDueAt: prior.nextDueAt ?? null,
        isDue:
          !prior.lastSuccessfulCheckAt ||
          !nextDueAt ||
          Number.isNaN(nextDueAt.getTime()) ||
          nextDueAt <= now,
      };
    })
    .filter((entry) => entry.isDue)
    .sort(
      (a, b) =>
        Number(Boolean(a.lastSuccessfulCheckAt)) -
          Number(Boolean(b.lastSuccessfulCheckAt)) ||
        Number(b.directions.includes("Quant")) -
          Number(a.directions.includes("Quant")) ||
        a.activeCardCount - b.activeCardCount ||
        a.company.localeCompare(b.company),
    );

  const limit = baseline.maxCompaniesPerRun ?? 20;
  return {
    generatedAt: now.toISOString(),
    totalPublicCompanyCount: companies.size,
    deferredLargeCompanyCount: deferred.size,
    dueCompanyCount: dueCompanies.length,
    selectedCompanies: dueCompanies.slice(0, limit),
  };
}

async function main() {
  const [jobsText, stateText, seedsText] = await Promise.all([
    readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
    readFile(new URL("../data/company-career-seeds.json", import.meta.url), "utf8"),
  ]);
  const jobs = JSON.parse(jobsText);
  const state = JSON.parse(stateText);
  const seeds = JSON.parse(seedsText);
  const source = state.sourceMonitoring.sources["company-careers"];
  console.log(JSON.stringify(buildCompanyCareerQueue(jobs, source, new Date(), seeds), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
