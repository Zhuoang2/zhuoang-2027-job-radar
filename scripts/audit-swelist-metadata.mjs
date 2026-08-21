import { readFile, writeFile } from "node:fs/promises";

const [metadataPath, repositoryAuditPath, outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error(
    "Usage: node scripts/audit-swelist-metadata.mjs <metadata-json> <repository-audit-json> <output-json>",
  );
}

const [metadataText, repositoryAuditText, jobsText, stateText] = await Promise.all([
  readFile(metadataPath, "utf8"),
  readFile(repositoryAuditPath, "utf8"),
  readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
  readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
]);

const metadata = JSON.parse(metadataText);
const repositoryAudit = JSON.parse(repositoryAuditText);
const jobs = JSON.parse(jobsText);
const state = JSON.parse(stateText);

function tokens(value) {
  if (!value) return [];
  const decoded = decodeURIComponent(value).toLowerCase();
  const output = new Set();
  for (const match of decoded.matchAll(/[0-9a-f]{8}-[0-9a-f-]{20,}|\b\d{5,}\b|\b(?:jr|rq|req|r)-?_?\d{4,}\b/gi)) {
    output.add(match[0].replace(/^_+|_+$/g, ""));
  }
  return [...output];
}

const knownTokens = new Set();
const knownUrls = new Set();
function remember(value) {
  if (!value) return;
  knownUrls.add(value.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase());
  for (const token of tokens(value)) knownTokens.add(token);
}

for (const job of jobs) {
  remember(job.canonicalUrl);
  remember(job.applyUrl);
  for (const alternate of job.alternateApplyUrls ?? []) remember(alternate.url);
}
for (const name of [
  "hardEligibilityExclusions",
  "preferenceExclusions",
  "officialVerificationNeedsReview",
]) {
  for (const item of state.sourceMonitoring[name] ?? []) remember(item.canonicalUrl);
}
for (const item of state.sourceMonitoring.suspectedDuplicates ?? []) {
  remember(item.currentCanonicalUrl);
  for (const value of item.possiblePriorCanonicalUrls ?? []) remember(value);
}
for (const candidate of repositoryAudit.candidates) remember(candidate.url);

const relevantTitle = /\b(software|developer|development|machine learning|\bml\b|artificial intelligence|\bai\b|data (engineer|scientist|analyst)|backend|back-end|infrastructure|quant|algorithm|research (scientist|engineer)|applied scientist|full[- ]?stack|front[- ]?end|mobile engineer|devops|site reliability|distributed systems|cloud engineer)\b/i;
const obviousOutOfScope = /\b(intern(ship)?|product manager|program manager|hardware|electrical|mechanical|manufacturing|silicon|asic|fpga|security engineer|cyber|firmware|embedded|test engineer|quality assurance|solutions? engineer|sales engineer|support engineer|business analyst|accountant|designer)\b/i;
const hardwareFunction = /hardware|electrical|mechanical|manufacturing|silicon|semiconductor/i;
const usLocation = /\b(?:USA|United States|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
const windowStart = new Date("2026-06-21T00:00:00-07:00");
const windowEnd = new Date("2026-08-21T00:00:00-07:00");

const reviewed = metadata.results.map((candidate) => {
  let preliminaryDisposition = "official-review";
  if (candidate.error) preliminaryDisposition = "needs-review";
  else if (
    candidate.active !== true ||
    candidate.visible === false ||
    candidate.archived === true ||
    candidate.endDate !== null
  ) preliminaryDisposition = "closed";
  else if (
    !candidate.startDate ||
    new Date(candidate.startDate) < windowStart ||
    new Date(candidate.startDate) >= windowEnd
  ) preliminaryDisposition = "outside-60d";
  else if (!(candidate.locations ?? []).some((value) => usLocation.test(value))) {
    preliminaryDisposition = "outside-us";
  } else if (
    !relevantTitle.test(`${candidate.title} ${(candidate.subtitles ?? []).join(" ")}`) ||
    obviousOutOfScope.test(`${candidate.title} ${(candidate.subtitles ?? []).join(" ")}`) ||
    (candidate.functions ?? []).some((value) => hardwareFunction.test(value))
  ) preliminaryDisposition = "out-of-scope-title";

  const candidateTokens = tokens(`${candidate.trackedObject ?? ""} ${candidate.clickUrl ?? ""}`);
  const known = candidateTokens.some((token) => knownTokens.has(token));
  return { ...candidate, known, preliminaryDisposition };
});

const output = {
  generatedAt: new Date().toISOString(),
  windowStart: metadata.windowStart,
  windowEndExclusive: metadata.windowEndExclusive,
  matchedMessageCount: metadata.matchedMessageCount,
  summary: {
    scanned: reviewed.length,
    known: reviewed.filter((item) => item.known).length,
    officialReview: reviewed.filter((item) => !item.known && item.preliminaryDisposition === "official-review").length,
    closed: reviewed.filter((item) => item.preliminaryDisposition === "closed").length,
    outside60d: reviewed.filter((item) => item.preliminaryDisposition === "outside-60d").length,
    outsideUs: reviewed.filter((item) => item.preliminaryDisposition === "outside-us").length,
    outOfScopeTitle: reviewed.filter((item) => item.preliminaryDisposition === "out-of-scope-title").length,
    needsReview: reviewed.filter((item) => item.preliminaryDisposition === "needs-review").length,
  },
  candidates: reviewed,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary, null, 2));
