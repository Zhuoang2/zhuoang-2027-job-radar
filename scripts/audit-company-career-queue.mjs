import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildCompanyCareerQueue } from "./list-company-career-queue.mjs";
import { classifyTimingEvidence } from "./job-timing-policy.mjs";

// Keep the title gate directional. A bare "engineer" admits unrelated chemical,
// electrical, mechanical, manufacturing, test, and building roles.
const relevantTitle = /\b(?:software|machine learning|ml|artificial intelligence|ai|data\s+(?:engineer|scientist|analyst)|backend|infrastructure|quant(?:itative)?|research\s+(?:engineer|scientist)|developer|systems?\s+engineer)\b/i;
const excludedTitle = /\b(?:intern(?:ship)?|co[- ]?op|frontend|front-end|mobile|ios|android|product manager|designer|sales|marketing|security engineer|cybersecurity|penetration tester|firmware|embedded|developer educator|technical specialist|api support)\b/i;
const experiencedTitle = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect)\b|\b(?:software\s+)?(?:developer|engineer)\s+(?:iii|iv|v|3|4|5)\b/i;
const earlyCareerTitle = /\b(?:new\s*grad(?:uate)?|recent\s+grad(?:uate)?|early\s+career|entry[- ]level|campus\s+hire|university\s+graduate|graduate\s+(?:program|programme|role|position)|junior|engineer\s+i\b|engineer\s+1\b)\b/i;
const pureTraderTitle = /\b(?:trader|trading analyst|market maker)\b/i;
const hardRestriction = /\b(?:U\.S\.? citizens? only|must be (?:a )?U\.S\.? citizens?|U\.S\.? citizenship (?:is )?required|security clearance required|(?:secret|top secret|TS\/SCI)(?: level)? clearance(?: with polygraph)? is required|active (?:secret|top secret|TS\/SCI) clearance|must have at least an interim secret|must be (?:a )?['\"“”]?U\.S\.? person|ITAR[^.]{0,180}U\.S\.? person|will not (?:provide|offer) (?:current or future )?(?:employment |visa )?sponsorship|will not sponsor|no (?:current or future )?(?:employment |visa )?sponsorship|unable to sponsor|do not require visa sponsorship now or in the future|may not be able to employ[^.]{0,180}support future H-?1B sponsorship)\b/i;
const excessiveExperience = /\b(?:[4-9]|[1-9]\d)\+?\s+years?\b|\b(?:minimum(?: of)?|at least|requires?|must have)\s+(?:3|[4-9]|[1-9]\d)\+?\s+years?\b|\b(?:3|[4-9]|[1-9]\d)\+\s+years?\s+(?:of\s+)?(?:professional|industry|relevant|software|engineering|experience)\b/i;
const lowLevelPreference = /\b(?:kernel|operating system internals|linux fleet|networking systems|storage systems|nix|rpm package|site reliability|production operations)\b/i;
const usLocation = /\b(?:United States|US|USA|Remote(?:\s*[-–]\s*US)?|New York|Chicago|California|San Francisco|San Jose|Seattle|Boston|Austin|Texas|Palo Alto|Menlo Park|Washington|Massachusetts|Illinois|Connecticut|Florida|Virginia|Pennsylvania|Colorado|Arizona|Georgia|North Carolina|New Jersey|Ohio|Maryland|Utah|Oregon|Michigan|Missouri|Minnesota|Wisconsin|Tennessee|Indiana|Iowa|Kansas|Nevada|Delaware|Rhode Island|New Hampshire|Vermont|Maine|Idaho|Montana|Wyoming|Nebraska|Oklahoma|Arkansas|Louisiana|Mississippi|Alabama|South Carolina|West Virginia|Kentucky|New Mexico|North Dakota|South Dakota|Alaska|Hawaii|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;

function canonicalUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return String(value).trim().replace(/\/$/, "");
  }
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|gh_src|source|ref|iis|iisn|lever-source|__jv)/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return String(value ?? "job").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function publicTokens(value) {
  if (!value) return [];
  return [...new Set(decodeURIComponent(value).toLowerCase().match(/[0-9a-f]{8}-[0-9a-f-]{20,}|\b\d{5,}\b|\b(?:jr|rq|req|r)-?_?\d{4,}\b/gi) ?? [])];
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000).toISOString();
}

function directionTags(job) {
  const text = `${job.title} ${stripHtml(job.description)}`;
  const tags = [];
  if (/\b(?:quant(?:itative)?|alpha|portfolio|pricing model|trading strategy)\b/i.test(text)) tags.push("Quant");
  if (/\b(?:machine learning|artificial intelligence|deep learning|recommendation|retrieval|llm|nlp|computer vision)\b/i.test(text)) tags.push("AI/ML");
  if (/\b(?:cuda|gpu|distributed training|ml infrastructure|machine learning systems|compiler|inference systems)\b/i.test(text)) tags.push("ML Systems");
  if (/\b(?:software|backend|data engineer|infrastructure|developer|distributed systems)\b/i.test(text)) tags.push("SWE/Data Infra");
  return [...new Set(tags.length ? tags : ["SWE/Data Infra"])];
}

function sponsorshipStatus(text) {
  if (hardRestriction.test(text)) return "not-supported";
  if (/\b(?:visa sponsorship (?:is )?available|sponsor(?:ship)? (?:is )?available|will sponsor|immigration support)\b/i.test(text)) return "confirmed";
  return "unknown";
}

function fitMetadata(tags) {
  if (tags.includes("Quant")) return { fitTier: "priority", fitScore: 94, resumeTrack: "Quant Research / Quant Development" };
  if (tags.includes("AI/ML") || tags.includes("ML Systems")) return { fitTier: "priority", fitScore: 92, resumeTrack: "MLE / AI" };
  return { fitTier: "recommended", fitScore: 88, resumeTrack: "SWE" };
}

export function providerFor(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { type: "unsupported" };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    /^(?:www\.)?squarepoint-capital\.com$/.test(url.hostname) &&
    ["early-careers", "open-opportunities"].includes(parts[0])
  ) {
    return { type: "greenhouse", slug: "squarepointcapital" };
  }
  if (/greenhouse\.io$/.test(url.hostname)) {
    const slug = parts[0] === "embed" ? url.searchParams.get("for") : parts[0];
    return slug ? { type: "greenhouse", slug } : null;
  }
  if (url.hostname === "jobs.lever.co") return { type: "lever", slug: parts[0] };
  if (url.hostname === "jobs.ashbyhq.com") return { type: "ashby", slug: parts[0] };
  if (/\.smartrecruiters\.com$/.test(url.hostname)) return { type: "smartrecruiters", slug: parts[0] };
  if (/myworkdayjobs\.com$/.test(url.hostname)) {
    const tenant = url.hostname.split(".")[0];
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? "") ? parts.shift() : "en-US";
    const site = parts[0];
    return tenant && site ? { type: "workday", host: url.hostname, tenant, site, locale } : { type: "unsupported" };
  }
  return { type: "unsupported" };
}

async function getJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "user-agent": "JobRadar/1.0", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function enumerateProvider(provider) {
  if (provider.type === "greenhouse") {
    const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${provider.slug}/jobs?content=true`);
    return data.jobs.map((job) => ({
      id: String(job.id), title: job.title, location: job.location?.name ?? "",
      description: job.content ?? "", url: canonicalUrl(job.absolute_url), updatedAt: job.updated_at ?? null,
    }));
  }
  if (provider.type === "lever") {
    const data = await getJson(`https://api.lever.co/v0/postings/${provider.slug}?mode=json`);
    return data.map((job) => ({
      id: job.id, title: job.text, location: job.categories?.location ?? "",
      description: `${job.descriptionPlain ?? ""} ${job.additionalPlain ?? ""}`,
      url: canonicalUrl(job.hostedUrl), updatedAt: job.createdAt ?? null,
    }));
  }
  if (provider.type === "ashby") {
    const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${provider.slug}`);
    const jobs = data.jobs ?? [];
    if (jobs.length > 200) return { deferred: true, observedCount: jobs.length };
    return jobs.map((job) => ({
      id: job.id ?? job.jobUrl, title: job.title, location: job.location ?? "",
      description: job.descriptionPlain ?? job.descriptionHtml ?? "",
      url: canonicalUrl(job.jobUrl ?? job.applyUrl), updatedAt: job.publishedAt ?? null,
    }));
  }
  if (provider.type === "smartrecruiters") {
    const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${provider.slug}/postings?limit=100&offset=0`);
    if ((data.totalFound ?? 0) > 200) return { deferred: true, observedCount: data.totalFound };
    return Promise.all((data.content ?? []).map(async (job) => {
      const detail = await getJson(`https://api.smartrecruiters.com/v1/companies/${provider.slug}/postings/${job.id}`);
      const description = Object.values(detail.jobAd?.sections ?? {})
        .flatMap((section) => [section?.title, section?.text])
        .filter(Boolean)
        .join(" ");
      return {
        id: job.id,
        title: detail.name ?? job.name,
        location: [detail.location?.city, detail.location?.region, detail.location?.country].filter(Boolean).join(", "),
        description,
        url: canonicalUrl(`https://jobs.smartrecruiters.com/${provider.slug}/${job.id}`),
        updatedAt: detail.releasedDate ?? job.releasedDate ?? null,
      };
    }));
  }
  if (provider.type === "workday") {
    const endpoint = `https://${provider.host}/wday/cxs/${provider.tenant}/${provider.site}/jobs`;
    const first = await getJson(endpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" }),
    });
    const total = first.total ?? first.totalCount ?? first.jobPostings?.length ?? 0;
    if (total > 200) return { deferred: true, observedCount: total };
    const all = [...(first.jobPostings ?? [])];
    for (let offset = 20; offset < total; offset += 20) {
      const page = await getJson(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }),
      });
      all.push(...(page.jobPostings ?? []));
    }
    return Promise.all(all.map(async (job) => {
      const detail = await getJson(`https://${provider.host}/wday/cxs/${provider.tenant}/${provider.site}${job.externalPath}`);
      const posting = detail.jobPostingInfo ?? detail;
      return {
        id: posting.jobReqId ?? job.bulletFields?.[0] ?? job.externalPath,
        title: posting.title ?? job.title,
        location: posting.location ?? job.locationsText ?? "",
        description: posting.jobDescription ?? posting.description ?? "",
        url: canonicalUrl(posting.externalUrl ?? `https://${provider.host}/${provider.locale}/${provider.site}${job.externalPath}`),
        updatedAt: posting.startDate ?? null,
      };
    }));
  }
  throw new Error("No stable public full-catalog API is configured for this careers site");
}

function chooseCareersUrl(company, selectedUrl, jobs) {
  const known = jobs.filter((job) => job.company === company).flatMap((job) => [job.canonicalUrl, job.applyUrl]).filter(Boolean);
  const candidates = [selectedUrl, ...known];
  return candidates.find((url) => providerFor(url)?.type !== "unsupported") ?? selectedUrl ?? known[0] ?? null;
}

function candidateDisposition(job, now = new Date()) {
  const text = `${job.title} ${stripHtml(job.description)}`;
  if (!relevantTitle.test(job.title) || excludedTitle.test(job.title)) return { status: "excluded", reason: "out-of-scope-title" };
  if (experiencedTitle.test(job.title)) return { status: "excluded", reason: "experienced-title" };
  if (pureTraderTitle.test(job.title) && !/\b(?:research|developer|engineer|software|quantitative strategy)\b/i.test(job.title)) return { status: "excluded", reason: "pure-trading-role" };
  if (!job.location?.trim()) return { status: "needs-review", reason: "missing-location-evidence" };
  if (!usLocation.test(job.location)) return { status: "excluded", reason: "non-us-location" };
  if (job.updatedAt) {
    const observedAt = new Date(job.updatedAt);
    if (!Number.isNaN(observedAt.getTime()) && now - observedAt > 60 * 86400000) {
      return { status: "excluded", reason: "outside-60-day-source-window" };
    }
  }
  if (hardRestriction.test(text)) return { status: "excluded", reason: "hard-work-authorization-restriction" };
  // Do not let an unrelated "graduate" mention elsewhere in a long catalog
  // description override a hard experience requirement. Only an explicit
  // early-career title may keep the role under review.
  if (excessiveExperience.test(text) && !earlyCareerTitle.test(job.title)) return { status: "excluded", reason: "hard-experience-requirement" };
  if (lowLevelPreference.test(text) && !/\b(?:machine learning|cuda|gpu|distributed training|backend|data infrastructure)\b/i.test(text)) return { status: "excluded", reason: "preference-low-level-systems" };
  if (!stripHtml(job.description)) return { status: "needs-review", reason: "official-detail-evidence-unavailable" };
  const timing = classifyTimingEvidence({ title: job.title, description: job.description, employmentType: "full-time" });
  if (timing.status === "exclude") return { status: "excluded", reason: timing.reasonCode };
  if (timing.status === "needs-review") return { status: "needs-review", reason: timing.reasonCode };
  return { status: "candidate", timingStatus: timing.status, reason: timing.reasonCode };
}

function normalizedTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function applicationIndex(records) {
  const urls = new Set();
  const keys = new Set();
  for (const record of records?.applications ?? []) {
    const job = record.job ?? {};
    if (job.canonical_url) urls.add(canonicalUrl(job.canonical_url));
    keys.add(`${normalizedTitle(job.company)}|${normalizedTitle(job.role)}`);
  }
  return { urls, keys };
}

function buildJobCard(company, candidate, checkedAt) {
  const tags = directionTags(candidate);
  const fit = fitMetadata(tags);
  const url = canonicalUrl(candidate.url);
  const description = stripHtml(candidate.description);
  const sponsorship = sponsorshipStatus(`${candidate.title} ${description}`);
  const startTiming = candidate.disposition.timingStatus;
  const updated = candidate.updatedAt ? new Date(candidate.updatedAt) : new Date(checkedAt);
  const ageDays = Number.isNaN(updated.getTime()) ? 0 : Math.max(0, Math.floor((new Date(checkedAt) - updated) / 86400000));
  return {
    id: `${slug(company)}-${slug(candidate.title)}-${slug(candidate.id)}`,
    canonicalUrl: url,
    company,
    role: candidate.title,
    location: candidate.location || "United States",
    ageDays,
    source: "Official company careers",
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    eligibility: startTiming === "confirmed-2027" ? "eligible" : "likely",
    startTiming,
    sponsorship,
    ...fit,
    directions: tags,
    reasons: [
      startTiming === "confirmed-2027" ? "官方职位页明确支持 2027 时间线" : "官方全职 New Grad / Early Career 职位；具体 2027 年 7 月入职时间待核实",
      `职责与 ${tags.join("、")} 方向匹配`,
    ],
    caveats: [
      ...(startTiming === "timing-check" ? ["官网未明确 2027 cohort 或开始日期，保留 timing-check"] : []),
      ...(sponsorship === "unknown" ? ["官网未说明 sponsorship/OPT 政策，保持 unknown"] : []),
    ],
    applyUrl: url,
    status: "open",
  };
}

export function applyCompanyCareerAudit({ jobs, state, ledger, applicationRecords, result, now = new Date() }) {
  const checkedAt = now.toISOString();
  const retryAfter = addDays(now, 1);
  const source = state.sourceMonitoring.sources["company-careers"];
  const baseline = source.baseline;
  baseline.companyStates ??= {};
  baseline.deferredLargeCompanies ??= [];
  state.sourceMonitoring.sourceMentions ??= {};
  state.sourceMonitoring.officialVerificationNeedsReview ??= [];
  state.sourceMonitoring.candidateDispositionLedger ??= {
    path: "data/candidate-dispositions.json",
    entryCount: 0,
    lastCheckedAt: null,
    privacy: "public job URLs and public screening dispositions only",
  };
  ledger.candidates ??= {};
  const appIndex = applicationIndex(applicationRecords);
  const jobUrls = new Map(jobs.map((job) => [canonicalUrl(job.canonicalUrl ?? job.applyUrl), job]));
  const jobKeys = new Map(jobs.map((job) => [`${normalizedTitle(job.company)}|${normalizedTitle(job.role)}`, job]));
  const jobTokens = new Map(jobs.flatMap((job) => [job.canonicalUrl, job.applyUrl, ...(job.alternateApplyUrls ?? []).map((item) => typeof item === "string" ? item : item.url)]
    .filter(Boolean).flatMap((url) => publicTokens(url).map((token) => [token, job]))));
  const admitted = [];
  const currentReviewedUrls = new Set(
    result.audits.flatMap((audit) => [
      ...(audit.candidates ?? []),
      ...(audit.needsReviewCandidates ?? []),
      ...(audit.excludedCandidates ?? []),
    ]).map((candidate) => canonicalUrl(candidate.url)).filter(Boolean),
  );
  state.sourceMonitoring.officialVerificationNeedsReview =
    state.sourceMonitoring.officialVerificationNeedsReview.filter(
      (item) => !currentReviewedUrls.has(canonicalUrl(item.canonicalUrl)),
    );
  const mentions = (url) => {
    const values = new Set(state.sourceMonitoring.sourceMentions[url] ?? []);
    values.add("company-careers");
    state.sourceMonitoring.sourceMentions[url] = [...values].sort();
  };

  for (const audit of result.audits) {
    if (audit.status === "complete") {
      baseline.companyStates[audit.company] = {
        publicCareersUrl: audit.publicCareersUrl,
        provider: audit.provider,
        status: "complete",
        inventoryCount: audit.inventoryCount,
        inventoryHash: audit.inventoryHash,
        candidateCount: audit.candidateCount,
        needsReviewCount: audit.needsReviewCount,
        lastSuccessfulCheckAt: checkedAt,
        nextDueAt: addDays(now, baseline.recheckIntervalDays ?? 14),
      };
    } else if (audit.status === "deferred-large-catalog") {
      const prior = baseline.deferredLargeCompanies.find((entry) => entry.company === audit.company);
      const entry = {
        company: audit.company,
        publicCareersUrl: audit.publicCareersUrl,
        status: audit.status,
        catalogSizeObservation: audit.observedCount,
        reason: "The official catalog exceeds the ordinary-run limit; no partial catalog was treated as complete.",
        firstDeferredAt: prior?.firstDeferredAt ?? checkedAt,
        lastObservedAt: checkedAt,
      };
      baseline.deferredLargeCompanies = baseline.deferredLargeCompanies.filter((item) => item.company !== audit.company);
      baseline.deferredLargeCompanies.push(entry);
      baseline.companyStates[audit.company] = { publicCareersUrl: audit.publicCareersUrl, status: audit.status, lastAttemptAt: checkedAt, reason: audit.blocker };
    } else {
      baseline.companyStates[audit.company] = { publicCareersUrl: audit.publicCareersUrl, status: "needs-review", lastAttemptAt: checkedAt, retryAfter, reason: audit.blocker };
    }

    for (const candidate of audit.excludedCandidates ?? []) {
      const url = canonicalUrl(candidate.url);
      const reason = candidate.disposition.reason;
      const status = /(?:pure-trading|preference)/.test(reason)
        ? "preference-excluded"
        : /(?:hard-|citizenship|sponsorship|experience|timing-incompatible)/.test(reason)
          ? "hard-excluded"
          : "out-of-scope";
      ledger.candidates[url] = { status, reasonCode: reason, lastCheckedAt: checkedAt };
      if (status === "hard-excluded") {
        state.sourceMonitoring.hardEligibilityExclusions ??= [];
        state.sourceMonitoring.hardEligibilityExclusions.push({ canonicalUrl: url, reason: `Official verification: ${reason}.` });
      } else if (status === "preference-excluded") {
        state.sourceMonitoring.preferenceExclusions ??= [];
        state.sourceMonitoring.preferenceExclusions.push({ canonicalUrl: url, reason: `Official verification: ${reason}.` });
      }
    }

    for (const candidate of audit.needsReviewCandidates ?? []) {
      const url = canonicalUrl(candidate.url);
      const key = `${normalizedTitle(audit.company)}|${normalizedTitle(candidate.title)}`;
      if (jobUrls.has(url) || jobKeys.has(key)) {
        const existing = jobUrls.get(url) ?? jobKeys.get(key);
        existing.lastCheckedAt = checkedAt;
        mentions(existing.canonicalUrl);
        ledger.candidates[url] = { status: "duplicate", reasonCode: "existing-job-card", lastCheckedAt: checkedAt };
        continue;
      }
      if (appIndex.urls.has(url) || appIndex.keys.has(key)) {
        ledger.candidates[url] = { status: "duplicate", reasonCode: "existing-application-record", lastCheckedAt: checkedAt };
        continue;
      }
      ledger.candidates[url] = { status: "needs-review", reasonCode: candidate.disposition.reason, firstSeenAt: ledger.candidates[url]?.firstSeenAt ?? checkedAt, lastAttemptAt: checkedAt, retryAfter };
      state.sourceMonitoring.officialVerificationNeedsReview.push({ canonicalUrl: url, reason: candidate.disposition.reason, status: "needs-review", firstSeenAt: checkedAt, lastAttemptAt: checkedAt, retryAfter });
    }

    for (const candidate of audit.candidates ?? []) {
      const url = canonicalUrl(candidate.url);
      const key = `${normalizedTitle(audit.company)}|${normalizedTitle(candidate.title)}`;
      const tokenMatch = publicTokens(url).map((token) => jobTokens.get(token)).find(Boolean);
      if (jobUrls.has(url) || tokenMatch || jobKeys.has(key)) {
        const existing = jobUrls.get(url) ?? tokenMatch ?? jobKeys.get(key);
        existing.lastCheckedAt = checkedAt;
        mentions(existing.canonicalUrl);
        ledger.candidates[url] = { status: "duplicate", reasonCode: "existing-job-card", lastCheckedAt: checkedAt };
        continue;
      }
      if (appIndex.urls.has(url) || appIndex.keys.has(key)) {
        ledger.candidates[url] = { status: "duplicate", reasonCode: "existing-application-record", lastCheckedAt: checkedAt };
        continue;
      }
      const card = buildJobCard(audit.company, candidate, checkedAt);
      if (card.sponsorship === "not-supported") {
        ledger.candidates[url] = { status: "hard-excluded", reasonCode: "no-future-sponsorship", lastCheckedAt: checkedAt };
        continue;
      }
      jobs.push(card);
      jobUrls.set(url, card);
      jobKeys.set(key, card);
      for (const token of publicTokens(url)) jobTokens.set(token, card);
      mentions(url);
      ledger.candidates[url] = { status: "admitted", reasonCode: candidate.disposition.reason, lastCheckedAt: checkedAt };
      admitted.push(card);
    }
  }

  state.sourceMonitoring.officialVerificationNeedsReview = [...new Map(state.sourceMonitoring.officialVerificationNeedsReview.map((item) => [canonicalUrl(item.canonicalUrl), item])).values()];
  state.sourceMonitoring.hardEligibilityExclusions = [...new Map((state.sourceMonitoring.hardEligibilityExclusions ?? []).map((item) => [canonicalUrl(item.canonicalUrl), item])).values()];
  state.sourceMonitoring.preferenceExclusions = [...new Map((state.sourceMonitoring.preferenceExclusions ?? []).map((item) => [canonicalUrl(item.canonicalUrl), item])).values()];
  const counts = Object.fromEntries(["complete", "needs-review", "deferred-large-catalog"].map((status) => [status, result.audits.filter((item) => item.status === status).length]));
  baseline.lastAttemptSummary = { checkedAt, selectedCompanies: result.audits.map((item) => item.company), status: counts["needs-review"] || counts["deferred-large-catalog"] ? "partially-complete-needs-review" : "complete", completeAuditCount: counts.complete, needsReviewCount: counts["needs-review"], deferredLargeCatalogCount: counts["deferred-large-catalog"], admittedJobCount: admitted.length, baselineAdvanced: counts.complete > 0 };
  baseline.lastBatch = {
    checkedAt,
    selectedCompanyCount: result.audits.length,
    completeAuditCount: counts.complete,
    needsReviewCount: counts["needs-review"],
    deferredLargeCount: counts["deferred-large-catalog"],
    admittedJobCount: admitted.length,
    companies: result.audits.map((item) => ({
      company: item.company,
      status: item.status,
      publicCareersUrl: item.publicCareersUrl,
      blocker: item.blocker ?? null,
      inventoryCount: item.inventoryCount ?? null,
      candidateCount: item.candidateCount ?? 0,
    })),
  };
  source.lastCheckedAt = checkedAt;
  if (counts.complete > 0) source.lastSuccessfulCheckAt = checkedAt;
  source.cycleStatus = counts["needs-review"] || counts["deferred-large-catalog"] ? "partially-complete-needs-review" : "complete";
  state.sourceMonitoring.candidateDispositionLedger.entryCount = Object.keys(ledger.candidates).length;
  state.sourceMonitoring.candidateDispositionLedger.lastCheckedAt = checkedAt;
  return { admitted, counts };
}

export async function auditCompanyCareerQueue({ jobs, source, seeds, now = new Date() }) {
  const queue = buildCompanyCareerQueue(jobs, source, now, seeds);
  const audits = [];
  for (const company of queue.selectedCompanies) {
    const publicCareersUrl = chooseCareersUrl(company.company, company.publicCareersUrl, jobs);
    const provider = providerFor(publicCareersUrl);
    if (!publicCareersUrl || !provider || provider.type === "unsupported") {
      audits.push({ company: company.company, status: "needs-review", publicCareersUrl, blocker: "no-stable-public-full-catalog-api" });
      continue;
    }
    try {
      const inventory = await enumerateProvider(provider);
      if (inventory?.deferred) {
        audits.push({ company: company.company, status: "deferred-large-catalog", publicCareersUrl, provider: provider.type, observedCount: inventory.observedCount, blocker: "catalog-over-200-openings" });
        continue;
      }
      const jobsWithDisposition = inventory.map((job) => ({ ...job, disposition: candidateDisposition(job, now) }));
      const candidates = jobsWithDisposition.filter((job) => job.disposition.status === "candidate");
      const needsReviewCandidates = jobsWithDisposition.filter((job) => job.disposition.status === "needs-review");
      const excludedCandidates = jobsWithDisposition.filter((job) => job.disposition.status === "excluded");
      const inventoryHash = createHash("sha256").update(JSON.stringify(inventory.map(({ id, title, location, url }) => ({ id, title, location, url })))).digest("hex");
      audits.push({
        company: company.company, status: "complete", publicCareersUrl, provider: provider.type,
        inventoryCount: inventory.length, inventoryHash, candidateCount: candidates.length,
        candidates, needsReviewCount: needsReviewCandidates.length,
        needsReviewCandidates, excludedCount: excludedCandidates.length, excludedCandidates,
      });
    } catch (error) {
      audits.push({ company: company.company, status: "needs-review", publicCareersUrl, provider: provider.type, blocker: error.message });
    }
  }
  return { generatedAt: now.toISOString(), queue, audits };
}

async function main() {
  const [jobsText, stateText, seedsText, ledgerText, applicationText] = await Promise.all([
    readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
    readFile(new URL("../data/company-career-seeds.json", import.meta.url), "utf8"),
    readFile(new URL("../data/candidate-dispositions.json", import.meta.url), "utf8"),
    readFile("/Users/madivhkassel/Documents/Codex/2026-07-04/plan/outputs/job_application_records.json", "utf8"),
  ]);
  const jobs = JSON.parse(jobsText);
  const state = JSON.parse(stateText);
  const seeds = JSON.parse(seedsText);
  const ledger = JSON.parse(ledgerText);
  const applicationRecords = JSON.parse(applicationText);
  const now = new Date();
  const result = await auditCompanyCareerQueue({ jobs, source: state.sourceMonitoring.sources["company-careers"], seeds, now });
  const applied = applyCompanyCareerAudit({ jobs, state, ledger, applicationRecords, result, now });
  await mkdir(new URL("../work/", import.meta.url), { recursive: true });
  await Promise.all([
    writeFile(new URL("../work/company-career-audit.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`),
    writeFile(new URL("../data/jobs.json", import.meta.url), `${JSON.stringify(jobs, null, 2)}\n`),
    writeFile(new URL("../data/source-state.json", import.meta.url), `${JSON.stringify(state, null, 2)}\n`),
    writeFile(new URL("../data/candidate-dispositions.json", import.meta.url), `${JSON.stringify({ ...ledger, checkedAt: now.toISOString() }, null, 2)}\n`),
  ]);
  const counts = Object.fromEntries(["complete", "needs-review", "deferred-large-catalog"].map((status) => [status, result.audits.filter((item) => item.status === status).length]));
  console.log(JSON.stringify({ generatedAt: result.generatedAt, selected: result.audits.length, ...counts, candidateCount: result.audits.reduce((sum, item) => sum + (item.candidateCount ?? 0), 0), admitted: applied.admitted.map((job) => `${job.company}: ${job.role}`), report: "work/company-career-audit.json" }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
