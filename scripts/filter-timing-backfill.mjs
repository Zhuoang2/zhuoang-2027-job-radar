import { mkdir, readFile, writeFile } from "node:fs/promises";
import { classifyTimingEvidence } from "./job-timing-policy.mjs";

const relevantTitle = /\b(?:software|machine learning|ml|artificial intelligence|ai|data|backend|infrastructure|quant(?:itative)?|research|developer|engineer)\b/i;
const excludedTitle = /\b(?:intern(?:ship)?|co[- ]?op|frontend|front-end|mobile|ios|android|product manager|designer|sales|marketing)\b/i;
const experiencedTitle = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect)\b/i;
const nonUsLocation = /\b(?:Canada|Toronto|Vancouver|United Kingdom|London|India|Singapore|Australia|Sydney|Europe|Berlin|Paris|Amsterdam|Dublin|Tokyo|Hong Kong|China)\b/i;
const usLocation = /\b(?:United States|US|USA|Remote(?:\s*[-–]\s*US)?|New York|Chicago|California|San Francisco|San Jose|Seattle|Boston|Austin|Texas|Palo Alto|Menlo Park|Washington|Massachusetts|Illinois|Connecticut|Florida|Virginia|Pennsylvania|Colorado|Arizona|Georgia|North Carolina|New Jersey|Ohio|Maryland|Utah|Oregon|Michigan|Missouri|Minnesota|Wisconsin|Tennessee|Indiana|Iowa|Kansas|Nevada|Delaware|Rhode Island|New Hampshire|Vermont|Maine|Idaho|Montana|Wyoming|Nebraska|Oklahoma|Arkansas|Louisiana|Mississippi|Alabama|South Carolina|West Virginia|Kentucky|New Mexico|North Dakota|South Dakota|Alaska|Hawaii)\b/i;

function canonicalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value.replace(/\\([&_])/g, "$1"));
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|gh_src|source|ref|iis|iisn|lever-source|__jv|trk|tracking)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

function disposition(candidate, knownUrls) {
  const url = canonicalUrl(candidate.url);
  if (knownUrls.has(url)) return { status: "excluded", reason: "already-known" };
  if (!relevantTitle.test(candidate.role) || excludedTitle.test(candidate.role)) return { status: "excluded", reason: "out-of-scope-title" };
  if (experiencedTitle.test(candidate.role)) return { status: "excluded", reason: "experienced-title" };
  const location = candidate.location ?? "";
  if (nonUsLocation.test(location) && !usLocation.test(location)) return { status: "excluded", reason: "non-us-location" };
  const timing = classifyTimingEvidence({ title: candidate.role, employmentType: "full-time" });
  if (timing.status === "exclude") return { status: "excluded", reason: timing.reasonCode };
  return {
    status: timing.status === "needs-review" ? "official-review" : "candidate",
    timingStatus: timing.status,
    reason: timing.reasonCode,
  };
}

const root = new URL("../", import.meta.url);
const [vanshb, simplify, jobs] = await Promise.all([
  readFile(new URL("work/vanshb-timing-backfill.json", root), "utf8").then(JSON.parse),
  readFile(new URL("work/simplify-timing-backfill.json", root), "utf8").then(JSON.parse),
  readFile(new URL("data/jobs.json", root), "utf8").then(JSON.parse),
]);

const knownUrls = new Set(jobs.flatMap((job) => [job.canonicalUrl, job.applyUrl]).filter(Boolean).map(canonicalUrl));
const byUrl = new Map();
for (const item of [...vanshb.candidates, ...simplify.candidates]) {
  const url = canonicalUrl(item.url);
  const existing = byUrl.get(url);
  if (existing) {
    existing.sources = [...new Set([...existing.sources, item.source])];
    continue;
  }
  byUrl.set(url, { ...item, url, sources: [item.source] });
}

const reviewed = [...byUrl.values()].map((item) => ({ ...item, disposition: disposition(item, knownUrls) }));
const candidates = reviewed.filter((item) => item.disposition.status === "candidate");
const officialReview = reviewed.filter((item) => item.disposition.status === "official-review");
const excludedCounts = reviewed
  .filter((item) => item.disposition.status === "excluded")
  .reduce((counts, item) => {
    counts[item.disposition.reason] = (counts[item.disposition.reason] ?? 0) + 1;
    return counts;
  }, {});
const excluded = reviewed.filter((item) => item.disposition.status === "excluded");
const result = {
  generatedAt: new Date().toISOString(),
  windowStart: vanshb.windowStart,
  windowEndExclusive: vanshb.windowEndExclusive,
  inputCount: reviewed.length,
  candidateCount: candidates.length,
  officialReviewCount: officialReview.length,
  excludedCounts,
  candidates,
  officialReview,
  excluded,
};
await mkdir(new URL("work/", root), { recursive: true });
await writeFile(new URL("work/timing-backfill-review.json", root), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, candidates: undefined, officialReview: undefined, report: "work/timing-backfill-review.json" }, null, 2));
