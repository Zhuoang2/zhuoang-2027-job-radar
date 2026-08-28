import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const checkedAt = new Date().toISOString();
const retryAfter = new Date(Date.now() + 86400000).toISOString();

const [jobs, state, ledger, records, review, verified, vanshb, simplify] = await Promise.all([
  readFile(new URL("data/jobs.json", root), "utf8").then(JSON.parse),
  readFile(new URL("data/source-state.json", root), "utf8").then(JSON.parse),
  readFile(new URL("data/candidate-dispositions.json", root), "utf8").then(JSON.parse),
  readFile("/Users/madivhkassel/Documents/Codex/2026-07-04/plan/outputs/job_application_records.json", "utf8").then(JSON.parse),
  readFile(new URL("work/timing-backfill-review.json", root), "utf8").then(JSON.parse),
  readFile(new URL("work/timing-backfill-verified.json", root), "utf8").then(JSON.parse),
  readFile(new URL("work/vanshb-timing-backfill.json", root), "utf8").then(JSON.parse),
  readFile(new URL("work/simplify-timing-backfill.json", root), "utf8").then(JSON.parse),
]);

function canonicalUrl(value) {
  if (!value) return null;
  const url = new URL(value.replace(/\\([&_])/g, "$1"));
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|gh_src|source|ref|iis|iisn|lever-source|__jv|trk|tracking|ats)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function publicTokens(value) {
  if (!value) return [];
  return [...new Set(decodeURIComponent(value).toLowerCase().match(/[0-9a-f]{8}-[0-9a-f-]{20,}|\b\d{5,}\b|\b(?:jr|rq|req|r)-?_?\d{4,}\b/gi) ?? [])];
}

function slug(value) {
  return String(value ?? "job").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 86);
}

function normalizedTitle(value) {
  return String(value ?? "").toLowerCase().replace(/\b(?:new grads?|graduate|2027|start|college grad|early career)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sourceLabel(candidate) {
  return candidate.sources?.includes("vanshb03")
    ? "vanshb03/New-Grad-2027 timing backfill"
    : "SimplifyJobs/New-Grad-Positions timing backfill";
}

function sourceKeys(candidate) {
  return candidate.sources?.length ? candidate.sources : [candidate.source];
}

function directionTags(candidate) {
  const text = `${candidate.company} ${candidate.role}`;
  const tags = [];
  if (/\b(?:trading|quant(?:itative)?|market|pricing|risk)\b/i.test(text)) tags.push("Quant");
  if (/\b(?:machine learning|\bml\b|artificial intelligence|\bai\b|recommendation|inference|research scientist)\b/i.test(text)) tags.push("AI/ML");
  if (/\b(?:ml infra|ai infra|inference|compute efficiency|scheduling|gpu|cuda|distributed training)\b/i.test(text)) tags.push("ML Systems");
  if (/\b(?:software|backend|infrastructure|developer|data engineer|data analyst|sql|full stack|system engineer)\b/i.test(text)) tags.push("SWE/Data Infra");
  return [...new Set(tags.length ? tags : ["SWE/Data Infra"])];
}

function fitMetadata(tags) {
  if (tags.includes("Quant")) return { fitTier: "priority", fitScore: 94, resumeTrack: "Quant / SWE" };
  if (tags.includes("AI/ML") || tags.includes("ML Systems")) return { fitTier: "priority", fitScore: 92, resumeTrack: "MLE / AI" };
  return { fitTier: "recommended", fitScore: 88, resumeTrack: "SWE" };
}

function normalizeLocation(value) {
  return String(value ?? "United States")
    .replace(/^LA$/, "Los Angeles, CA")
    .replace(/^SF$/, "San Francisco, CA")
    .replace(/^NYC$/, "New York, NY");
}

function candidateKey(candidate) {
  return `${normalizedTitle(candidate.company)}|${normalizedTitle(candidate.role)}|${normalizedTitle(candidate.location)}`;
}

function jobValues(job) {
  return [job.canonicalUrl, job.applyUrl, ...(job.alternateApplyUrls ?? []).map((item) => typeof item === "string" ? item : item.url)].filter(Boolean);
}

function findExisting(candidate) {
  const url = canonicalUrl(candidate.url);
  const tokens = new Set(publicTokens(url));
  const exact = jobs.find((job) => jobValues(job).some((value) => canonicalUrl(value) === url));
  if (exact) return exact;
  const tokenMatch = jobs.find((job) => jobValues(job).some((value) => publicTokens(value).some((token) => tokens.has(token))));
  if (tokenMatch) return tokenMatch;
  return jobs.find((job) => candidateKey(job) === candidateKey(candidate));
}

function applicationDuplicate(candidate) {
  const url = canonicalUrl(candidate.url);
  const tokens = new Set(publicTokens(url));
  return (records.applications ?? []).some((record) => {
    const job = record.job ?? {};
    if (job.canonical_url && canonicalUrl(job.canonical_url) === url) return true;
    if (job.canonical_url && publicTokens(job.canonical_url).some((token) => tokens.has(token))) return true;
    return candidateKey({ company: job.company, role: job.role, location: job.location }) === candidateKey(candidate);
  });
}

function addSourceMention(url, sources) {
  state.sourceMonitoring.sourceMentions ??= {};
  const key = canonicalUrl(url);
  const values = new Set(state.sourceMonitoring.sourceMentions[key] ?? []);
  for (const source of sources) values.add(source);
  state.sourceMonitoring.sourceMentions[key] = [...values].sort();
}

function addAlternate(existing, candidate) {
  const incoming = canonicalUrl(candidate.url);
  if (jobValues(existing).map(canonicalUrl).includes(incoming)) return;
  existing.alternateApplyUrls = [
    ...(existing.alternateApplyUrls ?? []),
    { label: `${sourceKeys(candidate).join(" + ")} timing backfill`, url: incoming },
  ];
}

function buildCard(candidate) {
  const tags = directionTags(candidate);
  const fit = fitMetadata(tags);
  const url = canonicalUrl(candidate.url);
  const firstSeenAt = candidate.firstAddedAt ?? checkedAt;
  const ageDays = Math.max(0, Math.floor((new Date(checkedAt) - new Date(firstSeenAt)) / 86400000));
  const sponsorship = candidate.url.includes("9RStfnAuq4") ? "confirmed" : "unknown";
  return {
    id: `${slug(candidate.company)}-${slug(candidate.role.replace(/🎓/g, ""))}-${slug(publicTokens(url).at(-1) ?? url)}`,
    canonicalUrl: url,
    company: candidate.company,
    role: candidate.role.replace(/\s*🎓\s*/g, "").trim(),
    location: normalizeLocation(candidate.location),
    ageDays,
    source: sourceLabel(candidate),
    firstSeenAt,
    lastCheckedAt: checkedAt,
    eligibility: candidate.disposition.timingStatus === "confirmed-2027" ? "eligible" : "likely",
    startTiming: candidate.disposition.timingStatus,
    sponsorship,
    ...fit,
    directions: tags,
    reasons: [
      candidate.disposition.timingStatus === "confirmed-2027"
        ? "官方职位页明确支持 2027 时间线"
        : "当前开放的美国全职 New Grad / Early Career 岗位，经验要求与应届生背景兼容",
      `职责与 ${tags.join("、")} 方向匹配`,
    ],
    caveats: [
      ...(candidate.disposition.timingStatus === "timing-check" ? ["官网未明确 2027 cohort 或开始日期，需确认能否在 2027 年 7 月入职"] : []),
      ...(sponsorship === "unknown" ? ["官网未说明 sponsorship/OPT 政策，保持 unknown"] : []),
    ],
    applyUrl: url,
    status: "open",
  };
}

const manualOverrides = new Map([
  ["https://wolve.pinpointhq.com/en/postings/1f33c89b-2592-498d-b45a-1b2092cf944e", ["hard-excluded", "no-future-sponsorship"]],
  ["https://wolve.pinpointhq.com/en/postings/e03d9864-a128-40ff-91b5-dfc9fd1b59d6", ["hard-excluded", "no-future-sponsorship"]],
  ["https://careers.roblox.com/jobs/8072244?gh_jid=8072244", ["hard-excluded", "no-future-h1b-support"]],
  ["https://gliacelltechnologies.applytojob.com/apply/5LJjRwD5B9/Junior-Java-Software-Engineer", ["hard-excluded", "us-citizenship-and-ts-sci-polygraph-required"]],
  ["https://gliacelltechnologies.applytojob.com/apply/Zet89PpNoU/Junior-Software-Engineer", ["hard-excluded", "us-citizenship-and-ts-sci-polygraph-required"]],
  ["https://careers.noblis.org/jobs/27467?icims=1", ["hard-excluded", "us-citizenship-and-ts-sci-polygraph-required"]],
  ["https://jobs.lever.co/hatchit/7f2e771d-2363-4e85-b62f-ca130c478a97/apply", ["hard-excluded", "secret-clearance-required"]],
  ["https://jobs.smartrecruiters.com/SmarterAgent/743999706496509", ["needs-review", "work-authorization-policy-ambiguous"]],
  ["https://fxcareers.applytojob.com/apply/7BQ85Q56Ap/Jr-Business-Data-Analyst-Top-5-Employer-In-PA", ["out-of-scope", "marketing-role-not-data-engineering"]],
].map(([url, value]) => [canonicalUrl(url), value]));

const hardReasons = new Set([
  "no-future-sponsorship", "citizenship-or-clearance-restriction", "phd-required",
  "experienced-role", "timing-incompatible-explicit-cycle", "official-page-closed",
  "http-410", "http-404",
]);
const preferenceReasons = new Set(["pure-trading-role", "preference-exclusion-core-embedded-systems", "preference-exclusion-core-systems"]);
const duplicateReasons = new Set(["already-known"]);
const outOfScopeReasons = new Set(["non-us-location", "out-of-scope-title", "internship"]);

function mappedDisposition(candidate, defaultStatus) {
  const manual = manualOverrides.get(canonicalUrl(candidate.url));
  if (manual) return { status: manual[0], reasonCode: manual[1] };
  const reason = candidate.disposition?.reason ?? candidate.disposition?.reasonCode ?? "official-verification-incomplete";
  if (defaultStatus === "eligible") return { status: "eligible", reasonCode: reason };
  if (duplicateReasons.has(reason)) return { status: "duplicate", reasonCode: reason };
  if (hardReasons.has(reason)) return { status: "hard-excluded", reasonCode: reason };
  if (preferenceReasons.has(reason)) return { status: "preference-excluded", reasonCode: reason };
  if (outOfScopeReasons.has(reason)) return { status: "out-of-scope", reasonCode: reason };
  return { status: "needs-review", reasonCode: reason };
}

function ledgerEntry(candidate, disposition) {
  if (disposition.status === "needs-review") {
    return {
      status: "needs-review", reasonCode: disposition.reasonCode,
      firstSeenAt: ledger.candidates?.[canonicalUrl(candidate.url)]?.firstSeenAt ?? candidate.firstAddedAt ?? checkedAt,
      lastAttemptAt: checkedAt, retryAfter,
    };
  }
  return { status: disposition.status, reasonCode: disposition.reasonCode, lastCheckedAt: checkedAt };
}

ledger.candidates ??= {};
state.sourceMonitoring.hardEligibilityExclusions ??= [];
state.sourceMonitoring.preferenceExclusions ??= [];
state.sourceMonitoring.officialVerificationNeedsReview ??= [];

const allReviewed = [
  ...(review.excluded ?? []).map((candidate) => ({ candidate, defaultStatus: "excluded" })),
  ...verified.excluded.map((candidate) => ({ candidate, defaultStatus: "excluded" })),
  ...verified.needsReview.map((candidate) => ({ candidate, defaultStatus: "needs-review" })),
  ...verified.eligible.map((candidate) => ({ candidate, defaultStatus: "eligible" })),
];
const counts = {};
const admitted = [];
const duplicateCards = [];

for (const { candidate, defaultStatus } of allReviewed) {
  const url = canonicalUrl(candidate.url);
  let disposition = mappedDisposition(candidate, defaultStatus);
  if (disposition.status === "eligible") {
    const existing = findExisting(candidate);
    if (existing) {
      addAlternate(existing, candidate);
      existing.lastCheckedAt = checkedAt;
      addSourceMention(existing.canonicalUrl, sourceKeys(candidate));
      const priorStatus = ledger.candidates[url]?.status;
      if (/timing backfill/i.test(existing.source) && ["eligible", "admitted"].includes(priorStatus)) {
        disposition = { status: "admitted", reasonCode: candidate.disposition.reason };
        admitted.push(existing);
      } else {
        disposition = { status: "duplicate", reasonCode: "existing-job-card" };
        duplicateCards.push(existing.id);
      }
    } else if (applicationDuplicate(candidate)) {
      disposition = { status: "duplicate", reasonCode: "existing-application-record" };
    } else {
      const card = buildCard(candidate);
      jobs.push(card);
      addSourceMention(card.canonicalUrl, sourceKeys(candidate));
      admitted.push(card);
      disposition = { status: "admitted", reasonCode: candidate.disposition.reason };
    }
  }
  const priorLedger = ledger.candidates[url];
  if (disposition.status === "duplicate" && disposition.reasonCode === "already-known" && priorLedger?.status && priorLedger.status !== "needs-review") {
    const existing = findExisting(candidate);
    if (existing) {
      addSourceMention(existing.canonicalUrl, sourceKeys(candidate));
      ledger.candidates[url] = { status: "admitted", reasonCode: "existing-job-card", lastCheckedAt: checkedAt };
    }
  } else {
    ledger.candidates[url] = ledgerEntry(candidate, disposition);
  }
  counts[disposition.status] = (counts[disposition.status] ?? 0) + 1;
  if (disposition.status === "hard-excluded") {
    state.sourceMonitoring.hardEligibilityExclusions.push({ canonicalUrl: url, reason: `Official verification: ${disposition.reasonCode}.` });
  } else if (disposition.status === "preference-excluded") {
    state.sourceMonitoring.preferenceExclusions.push({ canonicalUrl: url, reason: `Official verification: ${disposition.reasonCode}.` });
  } else if (disposition.status === "needs-review") {
    state.sourceMonitoring.officialVerificationNeedsReview.push({
      canonicalUrl: url, reason: disposition.reasonCode, status: "needs-review",
      firstSeenAt: candidate.firstAddedAt ?? checkedAt, lastAttemptAt: checkedAt, retryAfter,
    });
  }
}

function dedupePublicList(items) {
  return [...new Map(items.map((item) => [canonicalUrl(item.canonicalUrl), { ...item, canonicalUrl: canonicalUrl(item.canonicalUrl) }])).values()];
}

state.sourceMonitoring.hardEligibilityExclusions = dedupePublicList(state.sourceMonitoring.hardEligibilityExclusions);
state.sourceMonitoring.preferenceExclusions = dedupePublicList(state.sourceMonitoring.preferenceExclusions);
state.sourceMonitoring.officialVerificationNeedsReview = dedupePublicList(state.sourceMonitoring.officialVerificationNeedsReview)
  .filter((item) => ledger.candidates[canonicalUrl(item.canonicalUrl)]?.status === "needs-review");

for (const [sourceName, artifact] of [["vanshb03", vanshb], ["simplifyjobs", simplify]]) {
  const source = state.sourceMonitoring.sources[sourceName];
  const observed = artifact.candidates.map((candidate) => canonicalUrl(candidate.url));
  source.baseline.seenCandidateCanonicalUrls = [...new Set([...(source.baseline.seenCandidateCanonicalUrls ?? []).map(canonicalUrl), ...observed])].sort();
  source.baseline.entryCount = source.baseline.seenCandidateCanonicalUrls.length;
  source.baseline.historyWindowAdditionCount = observed.length;
  source.baseline.backfillStatus = "complete";
  source.baseline.timingPolicyCorrection = {
    status: "complete", windowStart: review.windowStart, windowEndExclusive: review.windowEndExclusive,
    observedAdditionCount: observed.length, completedAt: checkedAt,
    policy: "explicit 2027 confirmed; compatible early-career roles retained as timing-check; incompatible earlier cycles excluded",
  };
  source.status = "complete";
  source.cycleStatus = "mixed-cycle-row-level-timing-evaluation";
  source.lastCheckedAt = checkedAt;
  source.lastSuccessfulCheckAt = checkedAt;
  source.note = "The one-month timing-policy correction is complete. Future incremental additions and material changes use row-level confirmed-2027 or timing-check evaluation; explicit incompatible earlier cycles remain excluded.";
}

// Remove one preliminary company-audit false positive: Security Engineering is outside this radar's target directions.
const solaceSecurityUrl = canonicalUrl("https://jobs.ashbyhq.com/solace/b021350f-40dc-4b28-ade4-2ab030bec05d");
const solaceSecurityIndex = jobs.findIndex((job) => canonicalUrl(job.canonicalUrl) === solaceSecurityUrl);
if (solaceSecurityIndex >= 0) jobs.splice(solaceSecurityIndex, 1);
delete state.sourceMonitoring.sourceMentions[solaceSecurityUrl];
ledger.candidates[solaceSecurityUrl] = { status: "out-of-scope", reasonCode: "out-of-scope-security-engineering", lastCheckedAt: checkedAt };
const companyBaseline = state.sourceMonitoring.sources["company-careers"].baseline;
if (companyBaseline.companyStates?.["Solace Health"]?.candidateCount === 2) companyBaseline.companyStates["Solace Health"].candidateCount = 1;
if (companyBaseline.lastAttemptSummary?.admittedJobCount === 2) companyBaseline.lastAttemptSummary.admittedJobCount = 1;
if (companyBaseline.lastBatch?.admittedJobCount === 2) companyBaseline.lastBatch.admittedJobCount = 1;
const solaceBatch = companyBaseline.lastBatch?.companies?.find((item) => item.company === "Solace Health");
if (solaceBatch?.candidateCount === 2) solaceBatch.candidateCount = 1;

state.sourceMonitoring.candidateDispositionLedger.entryCount = Object.keys(ledger.candidates).length;
state.sourceMonitoring.candidateDispositionLedger.lastCheckedAt = checkedAt;
ledger.checkedAt = checkedAt;

await Promise.all([
  writeFile(new URL("data/jobs.json", root), `${JSON.stringify(jobs, null, 2)}\n`),
  writeFile(new URL("data/source-state.json", root), `${JSON.stringify(state, null, 2)}\n`),
  writeFile(new URL("data/candidate-dispositions.json", root), `${JSON.stringify(ledger, null, 2)}\n`),
  writeFile(new URL("work/timing-backfill-applied.json", root), `${JSON.stringify({
    checkedAt, inputCount: allReviewed.length, counts, admitted: admitted.map(({ id, company, role, canonicalUrl }) => ({ id, company, role, canonicalUrl })),
    duplicateCardCount: new Set(duplicateCards).size, removedPreliminaryFalsePositive: solaceSecurityUrl,
  }, null, 2)}\n`),
]);

console.log(JSON.stringify({ checkedAt, inputCount: allReviewed.length, counts, admittedCount: admitted.length, duplicateCardCount: new Set(duplicateCards).size, report: "work/timing-backfill-applied.json" }, null, 2));
