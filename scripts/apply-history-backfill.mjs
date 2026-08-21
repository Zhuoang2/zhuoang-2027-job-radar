import { readFile, writeFile } from "node:fs/promises";

const checkedAt = "2026-08-20T18:07:56-07:00";
const retryAfter = "2026-08-27T08:00:00-07:00";
const [speedyHistoryPath, vanshbHistoryPath] = process.argv.slice(2);
if (!vanshbHistoryPath) {
  throw new Error(
    "Usage: node scripts/apply-history-backfill.mjs <speedy-history-json> <vanshb-history-json>",
  );
}
const jobsUrl = new URL("../data/jobs.json", import.meta.url);
const stateUrl = new URL("../data/source-state.json", import.meta.url);
const ledgerUrl = new URL("../data/candidate-dispositions.json", import.meta.url);
const [jobsText, stateText, ledgerText, speedyHistoryText, vanshbHistoryText] = await Promise.all([
  readFile(jobsUrl, "utf8"),
  readFile(stateUrl, "utf8"),
  readFile(ledgerUrl, "utf8"),
  readFile(speedyHistoryPath, "utf8"),
  readFile(vanshbHistoryPath, "utf8"),
]);
const jobs = JSON.parse(jobsText);
const state = JSON.parse(stateText);
const ledger = JSON.parse(ledgerText);
const speedyHistory = JSON.parse(speedyHistoryText);
const vanshbHistory = JSON.parse(vanshbHistoryText);

function normalizeUrl(value) {
  if (!value?.startsWith("http")) return value;
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["embed", "ref", "source", "spread"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

const addedJobs = [
  {
    id: "arrowstreet-capital-quantitative-developer-r1433",
    canonicalUrl: "https://arrowstreetcapital.wd5.myworkdayjobs.com/en-US/arrowstreet/job/Boston/Quantitative-Developer_R1433-1",
    company: "Arrowstreet Capital",
    role: "Quantitative Developer",
    location: "Boston, MA",
    ageDays: 15,
    source: "SpeedyApply historical backfill",
    firstSeenAt: "2026-08-05T07:22:14-07:00",
    lastCheckedAt: checkedAt,
    eligibility: "likely",
    startTiming: "timing-check",
    sponsorship: "unknown",
    fitTier: "priority",
    fitScore: 97,
    directions: ["Quant", "SWE/Data Infra"],
    resumeTrack: "Quant / Backend-Data Infra",
    reasons: [
      "官方职责直接支持投资研究、信号回测、收益/风险/交易成本预测和研究数据平台",
      "Python、R、SQL、统计建模、数值算法、分布式计算与高性能计算背景高度匹配",
      "岗位接受计算机科学结合数学/金融，或定量学位结合计算机科学的本科或研究生",
    ],
    caveats: [
      "官方要求 1–3 年相关经验；需由招聘方确认实习和研究经历是否满足",
      "官网未明确 2027 cohort 或开始日期，保留 timing-check",
      "官网未说明 sponsorship/OPT 政策，保持 unknown",
    ],
    applyUrl: "https://arrowstreetcapital.wd5.myworkdayjobs.com/en-US/arrowstreet/job/Boston/Quantitative-Developer_R1433-1",
    status: "open",
  },
  {
    id: "uber-software-engineer-i-159863",
    canonicalUrl: "https://www.uber.com/global/en/careers/list/159863",
    company: "Uber",
    role: "Software Engineer I",
    location: "Sunnyvale, CA",
    ageDays: 55,
    source: "SpeedyApply historical backfill",
    firstSeenAt: "2026-06-26T07:36:31-07:00",
    lastCheckedAt: checkedAt,
    eligibility: "likely",
    startTiming: "timing-check",
    sponsorship: "unknown",
    fitTier: "recommended",
    fitScore: 90,
    directions: ["SWE/Data Infra"],
    resumeTrack: "General SWE / Backend-Data Infra",
    reasons: [
      "官方岗位接受计算机科学、工程、数学等相关硕士学位",
      "职责覆盖后端开发、API、数据结构与算法、分布式系统和生产服务可靠性",
      "Python/C++、SQL、云端数据和分布式系统经历与岗位技术栈匹配",
    ],
    caveats: [
      "官方未明确 2027 cohort 或开始日期，保留 timing-check",
      "岗位列出较具体的后端、DevOps 和生产系统技能，需按简历证据取舍",
      "官网未说明 sponsorship/OPT 政策，保持 unknown",
    ],
    applyUrl: "https://www.uber.com/global/en/careers/list/159863",
    status: "open",
  },
];

for (const candidate of addedJobs) {
  const existing = jobs.find((job) => job.id === candidate.id);
  if (existing) Object.assign(existing, candidate, { firstSeenAt: existing.firstSeenAt });
  else jobs.push(candidate);
}

function addAlternate(jobId, label, url) {
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Missing job: ${jobId}`);
  const existing = new Set([
    job.canonicalUrl,
    job.applyUrl,
    ...(job.alternateApplyUrls ?? []).map((alternate) => alternate.url),
  ]);
  if (!existing.has(url)) {
    job.alternateApplyUrls = [...(job.alternateApplyUrls ?? []), { label, url }];
  }
  job.lastCheckedAt = checkedAt;
}

addAlternate(
  "salesforce-software-engineering-amts-college-grad-jr355250",
  "Prior external requisition",
  "https://salesforce.wd12.myworkdayjobs.com/en-US/external_career_site/job/California---San-Francisco/Software-Engineering-AMTS-MTS--College-Grad-_JR330400-1",
);
addAlternate(
  "salesforce-software-engineering-amts-college-grad-jr355250",
  "Prior Futureforce requisition",
  "https://salesforce.wd12.myworkdayjobs.com/en-US/futureforce_newgradroles/job/California---San-Francisco/Software-Engineering-AMTS-MTS--College-Grad-_JR330400",
);

const dispositions = new Map([
  ["https://www.uber.com/global/en/careers/list/159863", ["admitted", "officially-verified-match"]],
  ["https://arrowstreetcapital.wd5.myworkdayjobs.com/en-US/arrowstreet/job/Boston/Quantitative-Developer_R1433-1", ["admitted", "officially-verified-match"]],
  ["https://salesforce.wd12.myworkdayjobs.com/en-US/external_career_site/job/California---San-Francisco/Software-Engineering-AMTS-MTS--College-Grad-_JR330400-1", ["duplicate", "merged-with-current-salesforce-college-grad-card"]],
  ["https://salesforce.wd12.myworkdayjobs.com/en-US/futureforce_newgradroles/job/California---San-Francisco/Software-Engineering-AMTS-MTS--College-Grad-_JR330400", ["duplicate", "merged-with-current-salesforce-college-grad-card"]],
  ["https://www.pinterestcareers.com/jobs/?gh_jid=6816337", ["hard-excluded", "one-plus-years-industry-experience-required"]],
  ["https://globalhr.wd5.myworkdayjobs.com/en-GB/REC_RTX_Ext_Gateway/job/US-CA-FULLERTON-676--1801-Hughes-Dr--BLDG-676/Software-Engineer-I---Onsite-_01857157", ["hard-excluded", "us-citizenship-and-secret-clearance-required"]],
  ["https://job-boards.greenhouse.io/simplisafe/jobs/8049510", ["hard-excluded", "official-requisition-redirects-to-error-page"]],
  ["https://jobs.apple.com/en-us/details/200621756-0157", ["hard-excluded", "official-page-no-longer-lists-the-requisition"]],
  ["https://www.amazon.jobs/jobs/3202388/apply", ["hard-excluded", "official-page-404"]],
  ["https://www.amazon.jobs/jobs/10464104/apply", ["hard-excluded", "official-page-404"]],
  ["https://www.amazon.jobs/jobs/10403353/apply", ["hard-excluded", "official-page-404"]],
  ["https://www.amazon.jobs/jobs/10468069/apply", ["hard-excluded", "official-page-404"]],
  ["https://www.amazon.jobs/jobs/10420146/apply", ["hard-excluded", "requires-june-2028-or-later-graduation"]],
  ["https://lifeattiktok.com/search/7668700671828707589", ["hard-excluded", "official-page-embedded-404"]],
  ["https://lifeattiktok.com/search/7668824172279875845", ["hard-excluded", "official-page-embedded-404"]],
  ["https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers/job/Earth-City-MO/Software-Engineer-1--Backend-UI-and-AI-_2026-0018795", ["hard-excluded", "two-to-three-years-relevant-experience-required"]],
  ["https://www.uber.com/global/en/careers/list/160024", ["needs-review", "official-page-blocked-and-current-requisition-status-unconfirmed"]],
  ["https://www.uber.com/global/en/careers/list/160028", ["needs-review", "official-page-blocked-and-current-requisition-status-unconfirmed"]],
  ["https://leidos.wd5.myworkdayjobs.com/External/job/St-Louis-MO/Entry-Level-Software-Developer_R-00186923", ["needs-review", "official-page-did-not-expose-verifiable-clearance-or-work-authorization-details"]],
]);

for (const [url, [status, reasonCode]] of dispositions) {
  ledger.candidates[url] = status === "needs-review"
    ? {
        status,
        reasonCode,
        firstSeenAt: checkedAt,
        lastAttemptAt: checkedAt,
        retryAfter,
      }
    : { status, reasonCode, lastCheckedAt: checkedAt };
}

const incompatibleCycle = /\b(?:2025|2026)\b/i;
for (const candidate of [...speedyHistory.candidates, ...vanshbHistory.candidates]) {
  const url = normalizeUrl(candidate.url);
  if (ledger.candidates[url]) continue;
  const status = incompatibleCycle.test(candidate.role) ? "hard-excluded" : "out-of-scope";
  ledger.candidates[url] = {
    status,
    reasonCode: status === "hard-excluded"
      ? "historical-row-explicitly-targeted-an-incompatible-cycle"
      : "historical-row-lacked-verifiable-early-career-or-target-role-evidence",
    lastCheckedAt: checkedAt,
  };
}

const retryUrls = new Set(
  [...dispositions].filter(([, [status]]) => status === "needs-review").map(([url]) => url),
);
const retainedReview = (state.sourceMonitoring.officialVerificationNeedsReview ?? []).filter(
  (candidate) => !retryUrls.has(candidate.canonicalUrl),
);
state.sourceMonitoring.officialVerificationNeedsReview = [
  ...retainedReview,
  ...[...retryUrls].map((canonicalUrl) => ({
    canonicalUrl,
    reason: "The historical source row needs another official-page verification attempt before admission or exclusion.",
    status: "needs-review",
    firstSeenAt: checkedAt,
    lastAttemptAt: checkedAt,
    retryAfter,
  })),
];
for (const candidate of state.sourceMonitoring.officialVerificationNeedsReview) {
  const canonicalUrl = normalizeUrl(candidate.canonicalUrl);
  ledger.candidates[canonicalUrl] = {
    status: "needs-review",
    reasonCode: ledger.candidates[canonicalUrl]?.reasonCode ?? "official-verification-retry-required",
    firstSeenAt: candidate.firstSeenAt,
    lastAttemptAt: candidate.lastAttemptAt,
    retryAfter: candidate.retryAfter,
  };
}
state.sourceMonitoring.suspectedDuplicates = (
  state.sourceMonitoring.suspectedDuplicates ?? []
).filter(
  (candidate) =>
    candidate.currentCanonicalUrl !== "https://www.pathai.com/careers/8696764002",
).map((candidate) => ({
  ...candidate,
  status: "needs-review",
  firstSeenAt: candidate.firstSeenAt ?? checkedAt,
  lastAttemptAt: candidate.lastAttemptAt ?? checkedAt,
  retryAfter: candidate.retryAfter ?? retryAfter,
}));
for (const candidate of state.sourceMonitoring.suspectedDuplicates) {
  const canonicalUrl = normalizeUrl(candidate.currentCanonicalUrl);
  ledger.candidates[canonicalUrl] = {
    status: "needs-review",
    reasonCode: "suspected-duplicate-requires-resolution",
    firstSeenAt: candidate.firstSeenAt,
    lastAttemptAt: candidate.lastAttemptAt,
    retryAfter: candidate.retryAfter,
  };
}

for (const job of addedJobs) {
  const mentions = new Set(state.sourceMonitoring.sourceMentions[job.canonicalUrl] ?? []);
  mentions.add("speedyapply");
  state.sourceMonitoring.sourceMentions[job.canonicalUrl] = [...mentions].sort();
}
state.sourceMonitoring.candidateDispositionLedger.entryCount = Object.keys(ledger.candidates).length;
const speedyHistoryUrls = speedyHistory.candidates.map((candidate) => normalizeUrl(candidate.url));
const speedySeen = [...new Set([...state.seenCanonicalUrls.map(normalizeUrl), ...speedyHistoryUrls])].sort();
state.seenCanonicalUrls = speedySeen;
state.baselineEntryCount = speedySeen.length;
state.sourceMonitoring.sources.speedyapply.baseline.entryCount = speedySeen.length;
state.sourceMonitoring.sources.speedyapply.baseline.historyWindowAdditionCount = speedyHistory.candidateCount;
const vanshbBaseline = state.sourceMonitoring.sources.vanshb03.baseline;
const vanshbSeen = [...new Set([
  ...(vanshbBaseline.seenCandidateCanonicalUrls ?? []).map(normalizeUrl),
  ...vanshbHistory.candidates.map((candidate) => normalizeUrl(candidate.url)),
])].sort();
vanshbBaseline.seenCandidateCanonicalUrls = vanshbSeen;
vanshbBaseline.entryCount = vanshbSeen.length;
vanshbBaseline.historyWindowAdditionCount = vanshbHistory.candidateCount;
state.sourceMonitoring.fullBackfill.speedyApplyHistoryAdditionCount = 277;
state.sourceMonitoring.fullBackfill.vanshb03HistoryAdditionCount = 26;
state.sourceMonitoring.fullBackfill.historicalOfficialCandidateReviewCount = dispositions.size;
state.sourceMonitoring.fullBackfill.admittedJobCount = 6;

jobs.sort((left, right) => right.fitScore - left.fitScore || left.company.localeCompare(right.company));
await Promise.all([
  writeFile(jobsUrl, `${JSON.stringify(jobs, null, 2)}\n`),
  writeFile(stateUrl, `${JSON.stringify(state, null, 2)}\n`),
  writeFile(ledgerUrl, `${JSON.stringify(ledger, null, 2)}\n`),
]);
console.log(JSON.stringify({
  jobs: jobs.length,
  added: addedJobs.map((job) => `${job.company}: ${job.role}`),
  ledgerEntries: Object.keys(ledger.candidates).length,
  retryableHistoricalCandidates: retryUrls.size,
}, null, 2));
