import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const [repositoryAuditPath, swelistAuditPath, repositoryOfficialPath, swelistOfficialPath] =
  process.argv.slice(2);

if (!swelistOfficialPath) {
  throw new Error(
    "Usage: node scripts/apply-60-day-backfill.mjs <repository-audit> <swelist-audit> <repository-official> <swelist-official>",
  );
}

const checkedAt = "2026-08-20T18:07:56-07:00";
const retryAfter = "2026-08-27T08:00:00-07:00";
const jobsUrl = new URL("../data/jobs.json", import.meta.url);
const stateUrl = new URL("../data/source-state.json", import.meta.url);
const dispositionUrl = new URL("../data/candidate-dispositions.json", import.meta.url);

const [jobsText, stateText, repositoryAuditText, swelistAuditText, repositoryOfficialText, swelistOfficialText] =
  await Promise.all([
    readFile(jobsUrl, "utf8"),
    readFile(stateUrl, "utf8"),
    readFile(repositoryAuditPath, "utf8"),
    readFile(swelistAuditPath, "utf8"),
    readFile(repositoryOfficialPath, "utf8"),
    readFile(swelistOfficialPath, "utf8"),
  ]);

const jobs = JSON.parse(jobsText);
const state = JSON.parse(stateText);
const repositoryAudit = JSON.parse(repositoryAuditText);
const swelistAudit = JSON.parse(swelistAuditText);
const repositoryOfficial = JSON.parse(repositoryOfficialText);
const swelistOfficial = JSON.parse(swelistOfficialText);

function normalizeUrl(value) {
  if (!value?.startsWith("http")) return value;
  const url = new URL(value.replace(/&amp;/g, "&"));
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["embed", "gh_src", "ref", "source", "spread"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function publicTokens(value) {
  if (!value) return [];
  return [
    ...new Set(
      decodeURIComponent(value)
        .toLowerCase()
        .match(/[0-9a-f]{8}-[0-9a-f-]{20,}|\b\d{5,}\b|\b(?:jr|rq|req|r)-?_?\d{4,}\b/gi) ?? [],
    ),
  ];
}

function alternateUrl(value) {
  return typeof value === "string" ? value : value?.url;
}

const acceptedJobs = [
  {
    id: "point72-cubist-quant-academy-developers-7598678002",
    canonicalUrl: "https://job-boards.greenhouse.io/point72/jobs/7598678002",
    company: "Point72",
    role: "2027 Cubist Quant Academy - Developers",
    location: "New York, NY",
    ageDays: 1,
    source: "SWELIST email lead",
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    eligibility: "eligible",
    startTiming: "confirmed-2027",
    sponsorship: "unknown",
    fitTier: "priority",
    fitScore: 97,
    directions: ["Quant", "SWE/Data Infra"],
    resumeTrack: "Quant / ML Systems-HPC",
    reasons: [
      "官方标题明确为 2027 Cubist Quant Academy，并接受计算机科学或工程本科、硕士毕业生",
      "Python、C++、系统开发与系统化交易技术方向高度匹配",
      "岗位轮岗覆盖量化研究和交易平台，并直接支持大规模自动化交易",
    ],
    caveats: [
      "官网申请表询问未来 sponsorship，但没有公开承诺政策，保持 unknown",
      "系统编程是加分项，岗位核心仍是量化研究与交易技术开发",
    ],
    applyUrl: "https://job-boards.greenhouse.io/point72/jobs/7598678002",
    status: "open",
  },
  {
    id: "ellipsis-labs-quantitative-developer-risk-0664c1db",
    canonicalUrl: "https://jobs.ashbyhq.com/ellipsislabs/0664c1db-ef07-44fc-947e-fda5a2948ee9",
    company: "Ellipsis Labs",
    role: "Quantitative Developer - Risk",
    location: "New York, NY",
    ageDays: 9,
    source: "SWELIST email lead",
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    eligibility: "likely",
    startTiming: "timing-check",
    sponsorship: "unknown",
    fitTier: "priority",
    fitScore: 95,
    directions: ["Quant", "SWE/Data Infra"],
    resumeTrack: "Quant / Backend-Data Infra",
    reasons: [
      "官方职责聚焦实时风险系统、定量模型、交易与研究基础设施",
      "官方明确表示优秀 New Grad 也会被考虑",
      "Python、统计建模、数据管线和生产级研究工具背景高度匹配",
    ],
    caveats: [
      "官方未明确 2027 cohort 或开始日期，保留 timing-check",
      "3 年相关经验为 preferred，优秀应届毕业生属于明确例外",
      "官网未说明 sponsorship/OPT 政策，保持 unknown",
    ],
    applyUrl: "https://jobs.ashbyhq.com/ellipsislabs/0664c1db-ef07-44fc-947e-fda5a2948ee9",
    status: "open",
  },
  {
    id: "abacus-insights-associate-data-engineer-8674746002",
    canonicalUrl: "https://job-boards.greenhouse.io/abacusinsights/jobs/8674746002",
    company: "Abacus Insights",
    role: "Associate Data Engineer",
    location: "Remote, US",
    ageDays: 16,
    source: "SWELIST email lead",
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    eligibility: "likely",
    startTiming: "timing-check",
    sponsorship: "opt-accepted",
    fitTier: "priority",
    fitScore: 93,
    directions: ["SWE/Data Infra"],
    resumeTrack: "Backend-Data Infra",
    reasons: [
      "官方明确欢迎 New Grad，并接受当前以 F-1 OPT 获得美国工作许可的候选人",
      "SQL、数据质量、数据映射和云端数据服务与现有数据工程经历高度匹配",
    ],
    caveats: [
      "官方未明确 2027 cohort 或入职日期，保留 timing-check",
      "官网只确认当前 OPT 可接受，没有说明未来 H-1B sponsorship",
    ],
    applyUrl: "https://job-boards.greenhouse.io/abacusinsights/jobs/8674746002",
    status: "open",
  },
  {
    id: "bytedance-3d-graphics-innovation-2027-7667926830305528117",
    canonicalUrl: "https://joinbytedance.com/search/7667926830305528117",
    company: "ByteDance",
    role: "3D Graphics Innovation Engineer Graduate (PICO Developer Technology) - 2027 Start",
    location: "San Jose, CA",
    ageDays: 16,
    source: "SWELIST email lead",
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    eligibility: "likely",
    startTiming: "confirmed-2027",
    sponsorship: "unknown",
    fitTier: "monitor",
    fitScore: 82,
    directions: ["ML Systems", "SWE/Data Infra"],
    resumeTrack: "ML Systems-HPC / General SWE",
    reasons: [
      "官方标题明确为 2027 Start，并接受计算机科学相关本科或硕士毕业生",
      "C++、GPU 性能优化和底层高性能计算经历可迁移到 XR 图形与性能工具开发",
    ],
    caveats: [
      "岗位要求 Vulkan/OpenGL 与 3D graphics 经验，当前简历证据有限",
      "官网未说明 sponsorship/OPT 政策，保持 unknown",
      "ByteDance 及关联公司全球最多申请两个岗位，需要先统一排序",
    ],
    applyUrl: "https://joinbytedance.com/search/7667926830305528117",
    status: "open",
  },
];

const backfillManagedIds = new Set([
  ...acceptedJobs.map((job) => job.id),
  "wavestone-junior-ai-engineer-744000143599414",
]);
for (let index = jobs.length - 1; index >= 0; index -= 1) {
  if (
    backfillManagedIds.has(jobs[index].id) &&
    !acceptedJobs.some((candidate) => candidate.id === jobs[index].id)
  ) {
    jobs.splice(index, 1);
  }
}

const acceptedTokens = new Set(
  acceptedJobs.flatMap((job) => publicTokens(job.canonicalUrl)),
);

for (const candidate of acceptedJobs) {
  const existing = jobs.find(
    (job) =>
      job.id === candidate.id ||
      publicTokens(job.canonicalUrl).some((token) =>
        publicTokens(candidate.canonicalUrl).includes(token),
      ),
  );
  if (existing) Object.assign(existing, candidate, { firstSeenAt: existing.firstSeenAt });
  else jobs.push(candidate);
}

function addAlternate(jobId, label, url) {
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Missing job for alternate URL: ${jobId}`);
  const normalized = normalizeUrl(url);
  const existing = new Set([
    job.canonicalUrl,
    job.applyUrl,
    ...(job.alternateApplyUrls ?? []).map(alternateUrl),
  ].map(normalizeUrl));
  if (!existing.has(normalized)) {
    job.alternateApplyUrls = [...(job.alternateApplyUrls ?? []), { label, url: normalized }];
  }
  job.lastCheckedAt = checkedAt;
}

addAlternate(
  "bytedance-agent-evaluation-evolution-mle-2027",
  "Seattle requisition",
  "https://joinbytedance.com/search/7672391016194066693",
);

function rememberJobTokens() {
  const tokenStatus = new Map();
  const urlStatus = new Map();
  for (const job of jobs) {
    for (const value of [job.canonicalUrl, job.applyUrl, ...(job.alternateApplyUrls ?? []).map(alternateUrl)]) {
      if (value) urlStatus.set(normalizeUrl(value), "admitted");
      for (const token of publicTokens(value)) tokenStatus.set(token, "admitted");
    }
  }
  for (const [listName, status] of [
    ["hardEligibilityExclusions", "hard-excluded"],
    ["preferenceExclusions", "preference-excluded"],
    ["officialVerificationNeedsReview", "needs-review"],
  ]) {
    for (const item of state.sourceMonitoring[listName] ?? []) {
      const normalized = normalizeUrl(item.canonicalUrl);
      if (!urlStatus.has(normalized)) urlStatus.set(normalized, status);
      for (const token of publicTokens(item.canonicalUrl)) {
        if (!tokenStatus.has(token)) tokenStatus.set(token, status);
      }
    }
  }
  return { tokenStatus, urlStatus };
}

const { tokenStatus: knownTokenStatus, urlStatus: knownUrlStatus } = rememberJobTokens();

const hardPattern = /no(?:t| longer)? (?:currently )?(?:able to |provide |offer )?(?:employer )?(?:visa |future )?sponsor(?:ship)?|will not sponsor|without (?:the )?need for current or future employer sponsorship|not currently able to engage candidates on opt|unable to sponsor|u\.s\. citizenship (?:is )?required|u\.s\. citizens only|must be (?:a )?(?:u\.s\.|us) citizen|active (?:secret|top secret) clearance|security clearance (?:is )?required/i;
const hardDegreePattern = /\bpostdoctoral\b|\bpostdoc\b|\(phd[）)]?|ph\.?d\.? (?:required|graduate|opportunit)/i;
const incompatibleTimingPattern = /\b2026 start\b|new college grad 2026/i;
const incompatibleExperiencePattern = /(?:minimum of|at least|requires?)\s+[2-9]\+?\s+years|\b[3-9]\+\s+years of (?:professional |relevant )?experience/i;
const preferencePattern = /\b(?:quant(?:itative)? trading associate|graduate trader|trader development program)\b/i;
const lowLevelPattern = /\b(?:kernel|operating systems? internals|linux fleet|network software|storage systems?|nix|rpm package)\b/i;

function officialDisposition(candidate) {
  const url = normalizeUrl(candidate.fetchedUrl ?? candidate.requestedUrl ?? candidate.url);
  const tokens = publicTokens(url);
  if (tokens.some((token) => acceptedTokens.has(token))) {
    return { status: "admitted", reasonCode: "officially-verified-match" };
  }
  const priorStatus = knownUrlStatus.get(url) ?? tokens.map((token) => knownTokenStatus.get(token)).find(Boolean);
  if (priorStatus) {
    return {
      status: priorStatus === "admitted" ? "duplicate" : priorStatus,
      reasonCode: priorStatus === "admitted" ? "already-represented-by-job-card" : "previously-dispositioned",
    };
  }
  if (candidate.httpStatus !== 200 || candidate.fetchError) {
    return { status: "needs-review", reasonCode: "official-page-fetch-failed" };
  }
  if ((candidate.closedEvidence ?? []).length > 0) {
    return { status: "hard-excluded", reasonCode: "official-page-closed" };
  }
  const allText = [
    candidate.pageTitle,
    candidate.role,
    candidate.title,
    ...(candidate.timingEvidence ?? []),
    ...(candidate.experienceEvidence ?? []),
    ...(candidate.sponsorshipEvidence ?? []),
    ...(candidate.degreeEvidence ?? []),
    ...(candidate.responsibilityEvidence ?? []),
  ].join(" ");
  if (hardPattern.test(allText)) {
    return { status: "hard-excluded", reasonCode: "work-authorization-or-clearance" };
  }
  if (hardDegreePattern.test(`${candidate.pageTitle ?? ""} ${candidate.role ?? candidate.title ?? ""}`)) {
    return { status: "hard-excluded", reasonCode: "degree-cohort-incompatible" };
  }
  if (incompatibleTimingPattern.test(`${candidate.pageTitle ?? ""} ${(candidate.timingEvidence ?? []).join(" ")}`)) {
    return { status: "hard-excluded", reasonCode: "start-timing-incompatible" };
  }
  if (
    incompatibleExperiencePattern.test((candidate.experienceEvidence ?? []).join(" ")) &&
    !/exceptional new graduates|new grad|recent graduate/i.test(allText)
  ) {
    return { status: "hard-excluded", reasonCode: "required-experience-incompatible" };
  }
  if (preferencePattern.test(allText) || lowLevelPattern.test(`${candidate.role ?? candidate.title ?? ""} ${(candidate.responsibilityEvidence ?? []).join(" ")}`)) {
    return { status: "preference-excluded", reasonCode: "outside-preferred-core-work" };
  }
  return { status: "needs-review", reasonCode: "official-evidence-insufficient-for-admission" };
}

const repositoryOfficialByUrl = new Map(
  repositoryOfficial.results.map((candidate) => [normalizeUrl(candidate.requestedUrl), candidate]),
);
const swelistOfficialByLead = new Map(
  swelistOfficial.results.map((candidate) => [candidate.leadUrl, candidate]),
);

function retryableDisposition(base, firstSeenAt = checkedAt) {
  return base.status === "needs-review"
    ? { ...base, firstSeenAt, lastAttemptAt: checkedAt, retryAfter }
    : { ...base, lastCheckedAt: checkedAt };
}

const candidateDispositions = {};
for (const candidate of repositoryAudit.candidates) {
  let disposition;
  if (candidate.known) {
    const statuses = publicTokens(candidate.url).map((token) => knownTokenStatus.get(token)).filter(Boolean);
    const status = statuses[0] ?? "duplicate";
    disposition = { status: status === "admitted" ? "duplicate" : status, reasonCode: "previously-dispositioned" };
  } else if (candidate.preliminaryDisposition === "out-of-scope-title") {
    disposition = { status: "out-of-scope", reasonCode: "title-or-function-outside-scope" };
  } else {
    disposition = officialDisposition(repositoryOfficialByUrl.get(normalizeUrl(candidate.url)) ?? candidate);
  }
  candidateDispositions[normalizeUrl(candidate.url)] = retryableDisposition(disposition);
}

for (const candidate of swelistAudit.candidates) {
  let disposition;
  if (candidate.preliminaryDisposition === "closed") {
    disposition = { status: "hard-excluded", reasonCode: "source-record-closed" };
  } else if (["outside-60d", "outside-us", "out-of-scope-title"].includes(candidate.preliminaryDisposition)) {
    disposition = { status: "out-of-scope", reasonCode: candidate.preliminaryDisposition };
  } else if (candidate.known) {
    const official = swelistOfficialByLead.get(candidate.leadUrl);
    const status = official ? officialDisposition(official) : { status: "duplicate", reasonCode: "previously-dispositioned" };
    disposition = status.status === "admitted" ? { status: "duplicate", reasonCode: "already-represented-by-job-card" } : status;
  } else {
    disposition = officialDisposition(swelistOfficialByLead.get(candidate.leadUrl) ?? candidate);
  }
  candidateDispositions[candidate.leadUrl] = retryableDisposition(disposition, candidate.startDate ?? checkedAt);
}

function upsertExclusion(listName, canonicalUrl, reason) {
  const list = state.sourceMonitoring[listName];
  const normalized = normalizeUrl(canonicalUrl);
  const existing = list.find((item) => normalizeUrl(item.canonicalUrl) === normalized);
  if (existing) Object.assign(existing, { canonicalUrl: normalized, reason });
  else list.push({ canonicalUrl: normalized, reason });
}

for (const candidate of [...repositoryOfficial.results, ...swelistOfficial.results]) {
  const disposition = officialDisposition(candidate);
  const officialUrl = normalizeUrl(candidate.fetchedUrl ?? candidate.requestedUrl ?? candidate.url);
  if (disposition.status === "hard-excluded") {
    upsertExclusion(
      "hardEligibilityExclusions",
      officialUrl,
      `60-day backfill: ${disposition.reasonCode.replaceAll("-", " ")}.`,
    );
  } else if (disposition.status === "preference-excluded") {
    upsertExclusion(
      "preferenceExclusions",
      officialUrl,
      `60-day backfill: ${disposition.reasonCode.replaceAll("-", " ")}.`,
    );
  }
}

const retryableOfficialUrls = new Map();
for (const candidate of [...repositoryOfficial.results, ...swelistOfficial.results]) {
  const disposition = officialDisposition(candidate);
  if (disposition.status !== "needs-review") continue;
  const canonicalUrl = normalizeUrl(candidate.fetchedUrl ?? candidate.requestedUrl ?? candidate.url);
  retryableOfficialUrls.set(canonicalUrl, {
    canonicalUrl,
    reason: "The 60-day backfill could not establish enough official timing, qualification, or sponsorship evidence for admission; retry is required.",
    status: "needs-review",
    firstSeenAt: candidate.startDate ?? checkedAt,
    lastAttemptAt: checkedAt,
    retryAfter,
  });
}
state.sourceMonitoring.officialVerificationNeedsReview = [
  ...state.sourceMonitoring.officialVerificationNeedsReview.filter(
    (candidate) => !retryableOfficialUrls.has(normalizeUrl(candidate.canonicalUrl)),
  ),
  ...retryableOfficialUrls.values(),
]
  .filter((candidate) => knownUrlStatus.get(normalizeUrl(candidate.canonicalUrl)) !== "admitted")
  .map((candidate) => ({
    ...candidate,
    status: "needs-review",
    firstSeenAt: candidate.firstSeenAt ?? checkedAt,
    lastAttemptAt: candidate.lastAttemptAt ?? checkedAt,
    retryAfter: candidate.retryAfter ?? retryAfter,
  }));

function addMention(url, source) {
  const normalized = normalizeUrl(url);
  const values = new Set(state.sourceMonitoring.sourceMentions[normalized] ?? []);
  values.add(source);
  state.sourceMonitoring.sourceMentions[normalized] = [...values].sort();
}

for (const job of acceptedJobs) addMention(job.canonicalUrl, "swelist-email");
for (const [jobId, url] of [
  ["bytedance-agent-evaluation-evolution-mle-2027", "https://joinbytedance.com/search/7672391016194066693"],
]) {
  const job = jobs.find((candidate) => candidate.id === jobId);
  addMention(job.canonicalUrl, "swelist-email");
  addMention(url, "swelist-email");
}

const swelistSource = state.sourceMonitoring.sources["swelist-email"];
const oldSwelistUrls = swelistSource.baseline.seenCandidateCanonicalUrls.map(normalizeUrl);
const newSwelistUrls = swelistAudit.candidates.map((candidate) => normalizeUrl(candidate.leadUrl));
const swelistUrls = [...new Set([...oldSwelistUrls, ...newSwelistUrls])].sort();
swelistSource.lastCheckedAt = checkedAt;
swelistSource.cycleStatus = "60-day-backfill-complete-daily-monitoring-resumed";
Object.assign(swelistSource.baseline, {
  mode: "normalized-public-candidate-urls-with-dispositions",
  entryCount: swelistUrls.length,
  seenCandidateCanonicalUrls: swelistUrls,
  backfillWindowStart: swelistAudit.windowStart,
  backfillWindowEndExclusive: swelistAudit.windowEndExclusive,
  matchedMessageCount: swelistAudit.matchedMessageCount,
  extractedPublicLinkCount: swelistAudit.summary.scanned,
  officialCandidateReviewCount: swelistAudit.summary.officialReview,
  admittedJobCount: acceptedJobs.length,
});
swelistSource.note = "Read-only 60-day SWELIST backfill completed with exact America/Los_Angeles calendar-day windows. Only public job facts and URLs were persisted; mailbox state and private mail metadata were not stored.";

const candidatesBySource = repositoryAudit.candidates.reduce((groups, candidate) => {
  (groups[candidate.source] ??= []).push(candidate);
  return groups;
}, {});
const speedyUrls = [...new Set(candidatesBySource.speedyapply.map((candidate) => normalizeUrl(candidate.url)))].sort();
let committedState;
try {
  committedState = JSON.parse(
    execFileSync("git", ["show", "HEAD:data/source-state.json"], { encoding: "utf8" }),
  );
} catch {
  committedState = { seenCanonicalUrls: [] };
}
const preservedSpeedyBaseline = (committedState.seenCanonicalUrls ?? []).length > 0
  ? committedState.seenCanonicalUrls
  : state.seenCanonicalUrls;
const historicalSpeedyUrls = [...new Set(preservedSpeedyBaseline)];
const historicalSpeedyNormalized = new Set(historicalSpeedyUrls.map(normalizeUrl));
for (const url of speedyUrls) {
  if (!historicalSpeedyNormalized.has(url)) {
    historicalSpeedyUrls.push(url);
    historicalSpeedyNormalized.add(url);
  }
}
state.seenCanonicalUrls = historicalSpeedyUrls.sort();
state.baselineEntryCount = state.seenCanonicalUrls.length;

const speedySource = state.sourceMonitoring.sources.speedyapply;
speedySource.lastCheckedAt = checkedAt;
Object.assign(speedySource.baseline, {
  entryCount: state.baselineEntryCount,
  current60DayEntryCount: speedyUrls.length,
  current60DayCandidateCanonicalUrls: speedyUrls,
  upstreamCommit: "8b547a1d7881f40ed9ecaab6f974a1856b10b1cf",
  backfillStatus: "complete",
});
speedySource.note = "Full 60-day audit completed from the preserved historical baseline. Every current-window candidate has a terminal or retryable disposition; historical URL history was unioned rather than replaced.";

for (const [sourceName, commit] of [
  ["vanshb03", "ac3093c1b67d6af1910361a75396508e8b257fb7"],
  ["simplifyjobs", "b5fde535e5373a90a3d10b8eeff5784aefdb4dde"],
]) {
  const source = state.sourceMonitoring.sources[sourceName];
  const currentUrls = [...new Set(candidatesBySource[sourceName].map((candidate) => normalizeUrl(candidate.url)))].sort();
  const priorUrls = source.baseline.seenCandidateCanonicalUrls ?? [];
  const union = [...new Set([...priorUrls.map(normalizeUrl), ...currentUrls])].sort();
  source.lastCheckedAt = checkedAt;
  Object.assign(source.baseline, {
    mode: "full-60d-observed-url-baseline-with-unified-timing-policy",
    entryCount: union.length,
    seenCandidateCanonicalUrls: union,
    current60DayEntryCount: currentUrls.length,
    upstreamCommit: commit,
    backfillStatus: "complete",
  });
}
state.sourceMonitoring.sources.vanshb03.note = "The source uses the universal timing policy: explicit compatible 2027 roles are confirmed; compatible full-time New Grad/Early Career roles without a stated year remain timing-check; explicit incompatible 2025/2026 cycles are excluded.";
state.sourceMonitoring.sources.simplifyjobs.cycleStatus = "mixed-cycle-row-screening";
state.sourceMonitoring.sources.simplifyjobs.note = "The repository title is not used as an admission gate. Every changed row uses the universal timing policy and official-page verification.";

state.sourceMonitoring.directionTaxonomy = {
  version: 2,
  canonicalTags: ["Quant", "AI/ML", "ML Systems", "SWE/Data Infra"],
  rule: "Exact responsibility-based tags; employer industry and resume track cannot broaden a direction filter.",
  lastAuditedAt: checkedAt,
};
delete state.sourceMonitoring.candidateDispositions;
state.sourceMonitoring.candidateDispositionLedger = {
  path: "data/candidate-dispositions.json",
  entryCount: Object.keys(candidateDispositions).length,
  lastCheckedAt: checkedAt,
  privacy: "public job URLs and public screening dispositions only",
};
state.sourceMonitoring.fullBackfill = {
  windowStart: "2026-06-21",
  windowEndExclusive: "2026-08-21",
  timeZone: "America/Los_Angeles",
  completedAt: checkedAt,
  swelistMatchedMessageCount: swelistAudit.matchedMessageCount,
  swelistPublicLeadCount: swelistAudit.summary.scanned,
  speedyApplyCandidateCount: candidatesBySource.speedyapply.length,
  vanshb03CandidateCount: candidatesBySource.vanshb03.length,
  simplifyCandidateCount: candidatesBySource.simplifyjobs.length,
  admittedJobCount: acceptedJobs.length,
  expirationCleanupPaused: true,
};

jobs.sort((left, right) => right.fitScore - left.fitScore || left.company.localeCompare(right.company));
await Promise.all([
  writeFile(jobsUrl, `${JSON.stringify(jobs, null, 2)}\n`),
  writeFile(stateUrl, `${JSON.stringify(state, null, 2)}\n`),
  writeFile(dispositionUrl, `${JSON.stringify({ checkedAt, candidates: candidateDispositions }, null, 2)}\n`),
]);

const dispositionCounts = Object.values(candidateDispositions).reduce((counts, disposition) => {
  counts[disposition.status] = (counts[disposition.status] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  jobs: jobs.length,
  added: acceptedJobs.map((job) => `${job.company}: ${job.role}`),
  dispositionCounts,
  sourceBaselines: {
    swelist: swelistUrls.length,
    speedyHistorical: state.baselineEntryCount,
    speedyCurrent60d: speedyUrls.length,
    vanshb03: state.sourceMonitoring.sources.vanshb03.baseline.entryCount,
    simplifyjobs: state.sourceMonitoring.sources.simplifyjobs.baseline.entryCount,
  },
}, null, 2));
