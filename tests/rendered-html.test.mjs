import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalDirections,
  jobMatchesDirection,
  selectVisibleJob,
} from "../lib/job-taxonomy.mjs";
import { buildCompanyCareerQueue } from "../scripts/list-company-career-queue.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the job radar dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>2027 Job Radar<\/title>/i);
  assert.match(html, /美国 New Grad 全职岗位/);
  assert.match(html, /SpeedyApply/);
  assert.match(html, /优先申请/);
  assert.match(html, /已处理/);
  assert.doesNotMatch(html, /申请记录/);
  assert.match(html, /Optiver/);
  assert.match(html, /查看官方岗位/);
  assert.match(html, /标记为已提交/);
  assert.doesNotMatch(html, /DV Trading/);
  assert.doesNotMatch(html, /已记录提交/);
  assert.match(html, /name="robots" content="noindex, nofollow"/i);
});

test("keeps the public job and application datasets privacy-safe", async () => {
  const [jobsText, stateText, dispositionsText, applicationsText, automationText] = await Promise.all([
    readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
    readFile(new URL("../data/candidate-dispositions.json", import.meta.url), "utf8"),
    readFile(new URL("../data/applications.json", import.meta.url), "utf8"),
    readFile(new URL("../AUTOMATION.md", import.meta.url), "utf8"),
  ]);

  const jobs = JSON.parse(jobsText);
  const state = JSON.parse(stateText);
  const dispositionLedger = JSON.parse(dispositionsText);
  const applications = JSON.parse(applicationsText);
  assert.ok(jobs.length >= 20);
  assert.equal(state.seenCanonicalUrls.length, state.baselineEntryCount);
  assert.ok(state.baselineEntryCount >= jobs.length);
  assert.deepEqual(state.sourceMonitoring.scanOrder, [
    "swelist-email",
    "speedyapply",
    "vanshb03",
    "simplifyjobs",
    "company-careers",
  ]);
  assert.equal(state.sourceMonitoring.sources["swelist-email"].role, "email-lead");
  assert.equal(
    state.sourceMonitoring.sources["swelist-email"].baseline.mode,
    "normalized-public-candidate-urls-with-dispositions",
  );
  assert.equal(state.sourceMonitoring.sources.speedyapply.role, "primary");
  assert.equal(state.sourceMonitoring.sources.vanshb03.role, "supplemental");
  assert.equal(state.sourceMonitoring.sources.simplifyjobs.role, "monitor");
  assert.equal(
    state.sourceMonitoring.sources["company-careers"].role,
    "official-company-expansion",
  );
  assert.equal(
    state.sourceMonitoring.sources["company-careers"].baseline.maxCompaniesPerRun,
    20,
  );
  assert.ok(
    state.sourceMonitoring.sources[
      "company-careers"
    ].baseline.deferredLargeCompanies.some(
      (company) =>
        company.company === "TikTok" &&
        company.status === "deferred-large-catalog" &&
        company.publicCareersUrl.startsWith("https://"),
    ),
    "large official career catalogs must remain explicitly deferred rather than partially screened",
  );
  assert.ok(Array.isArray(state.sourceMonitoring.suspectedDuplicates));
  assert.ok(
    state.sourceMonitoring.suspectedDuplicates.every(
      (candidate) =>
        candidate.status === "needs-review" &&
        typeof candidate.firstSeenAt === "string" &&
        typeof candidate.lastAttemptAt === "string" &&
        typeof candidate.retryAfter === "string" &&
        dispositionLedger.candidates[candidate.currentCanonicalUrl]?.status === "needs-review",
    ),
    "suspected duplicates must stay retryable until resolved",
  );
  assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
  assert.equal(new Set(jobs.map((job) => job.canonicalUrl)).size, jobs.length);
  assert.match(
    automationText,
    /isolated official-page access failure as a candidate-level verification failure/i,
  );
  assert.match(automationText, /Official company expansion/i);
  assert.match(automationText, /deferred-large-catalog/i);
  assert.match(automationText, /sibling roles that aggregators omitted/i);
  assert.ok(Array.isArray(state.sourceMonitoring.officialVerificationNeedsReview));
  assert.ok(
    state.sourceMonitoring.officialVerificationNeedsReview.every(
      (candidate) =>
        candidate.status === "needs-review" &&
        typeof candidate.firstSeenAt === "string" &&
        typeof candidate.lastAttemptAt === "string" &&
        typeof candidate.retryAfter === "string" &&
        !jobs.some((job) => job.canonicalUrl === candidate.canonicalUrl),
    ),
  );
  assert.equal(
    dispositionLedger.checkedAt,
    state.sourceMonitoring.candidateDispositionLedger.lastCheckedAt,
  );
  assert.equal(
    Object.keys(dispositionLedger.candidates).length,
    state.sourceMonitoring.candidateDispositionLedger.entryCount,
  );
  const dispositionValues = Object.values(dispositionLedger.candidates);
  const allowedDispositions = new Set([
    "admitted",
    "hard-excluded",
    "preference-excluded",
    "out-of-scope",
    "duplicate",
    "needs-review",
  ]);
  assert.ok(dispositionValues.length > 0);
  assert.ok(
    dispositionValues.every((candidate) =>
      allowedDispositions.has(candidate.status),
    ),
  );
  assert.ok(
    dispositionValues
      .filter((candidate) => candidate.status === "needs-review")
      .every(
        (candidate) =>
          typeof candidate.firstSeenAt === "string" &&
          typeof candidate.lastAttemptAt === "string" &&
          typeof candidate.retryAfter === "string",
      ),
    "retryable candidates must not be suppressed without retry metadata",
  );
  assert.ok(
    state.sourceMonitoring.officialVerificationNeedsReview.every(
      (candidate) =>
        dispositionLedger.candidates[candidate.canonicalUrl]?.status === "needs-review",
    ),
    "every official retry queue entry must be represented in the disposition ledger",
  );
  assert.equal(
    state.sourceMonitoring.sources["swelist-email"].baseline.entryCount,
    state.sourceMonitoring.sources["swelist-email"].baseline.seenCandidateCanonicalUrls.length,
  );
  assert.ok(
    state.sourceMonitoring.sources["swelist-email"].baseline.entryCount >= 949,
    "the SWELIST baseline must be unioned rather than replaced by a shorter window",
  );
  assert.ok(
    jobs.every(
      (job) =>
        job.applyUrl.startsWith("https://") &&
        ["confirmed-2027", "timing-check"].includes(job.startTiming) &&
        ["confirmed", "opt-accepted", "unknown"].includes(job.sponsorship),
    ),
  );
  assert.ok(
    jobs.every(
      (job) =>
        job.directions.length > 0 &&
        new Set(job.directions).size === job.directions.length &&
        job.directions.every((direction) =>
          canonicalDirections.includes(direction),
        ),
    ),
    "every job should use only canonical direction tags",
  );
  const bytedanceRecommendationRole = jobs.find(
    (job) => job.id === "bytedance-research-scientist-recommendation-2027",
  );
  assert.ok(bytedanceRecommendationRole);
  assert.equal(
    jobMatchesDirection(bytedanceRecommendationRole.directions, "Quant"),
    false,
    "the ByteDance recommendation-research role must not leak into Quant",
  );
  assert.doesNotMatch(bytedanceRecommendationRole.resumeTrack, /Quant/i);
  const genericDataScientistRole = jobs.find(
    (job) => job.id === "sciemo-data-scientist-63626f61",
  );
  assert.ok(genericDataScientistRole);
  assert.equal(
    jobMatchesDirection(genericDataScientistRole.directions, "Quant"),
    false,
    "generic quantitative methods alone must not create a Quant tag",
  );
  assert.ok(Array.isArray(applications.applications));
  assert.ok(
    applications.applications.some(
      (application) =>
        application.id === "dv-trading-2027-graduate-swe-4719126005" &&
        application.status === "submitted",
      ),
  );
  const mavenQuantResearchRole = jobs.find(
    (job) => job.id === "maven-graduate-quant-researcher-chicago-2027",
  );
  assert.ok(mavenQuantResearchRole);
  assert.ok(mavenQuantResearchRole.directions.includes("Quant"));
  assert.equal(
    dispositionLedger.candidates[
      "https://job-boards.greenhouse.io/mavensecuritiesholdingltd/jobs/8048830"
    ]?.status,
    "admitted",
    "Maven Quant Research must not be misclassified as out of scope",
  );
  assert.ok(
    applications.applications.some(
      (application) =>
        application.id === "maven-graduate-quant-researcher-chicago-2027" &&
        application.status === "submitted",
    ),
  );
  assert.ok(
    !jobs.some(
      (job) =>
        job.canonicalUrl ===
        "https://job-boards.greenhouse.io/mavensecuritiesholdingltd/jobs/8051635",
    ),
    "the same-company pure Trader role should not remain in the active dataset",
  );
  assert.ok(
    state.sourceMonitoring.preferenceExclusions.some(
      (candidate) =>
        candidate.canonicalUrl ===
        "https://job-boards.greenhouse.io/mavensecuritiesholdingltd/jobs/8051635",
    ),
    "the excluded Maven Trader role must remain suppressed across future scans",
  );
  const submittedIds = new Set(
    applications.applications
      .filter((application) => application.status === "submitted")
      .map((application) => application.id),
  );
  assert.ok(
    jobs.some((job) => submittedIds.has(job.id)),
    "submitted applications should retain their public job record for the applications view",
  );
  assert.ok(
    applications.applications.every((application) => {
      const fields = Object.keys(application).sort();
      return (
        fields.every((field) => ["company", "id", "role", "status"].includes(field)) &&
        ["applying", "needs-review", "submitted", "paused", "skipped"].includes(
          application.status,
        )
      );
    }),
  );
  assert.doesNotMatch(
    `${jobsText}\n${stateText}\n${dispositionsText}\n${applicationsText}`,
    /@stanford\.edu|@gmail\.com|@swelist\.com|comstock|date of birth|birthday|phone number/i,
  );

  const forbiddenMailKeys = new Set([
    "body",
    "email",
    "labels",
    "messageid",
    "recipient",
    "sender",
    "subject",
    "threadid",
  ]);
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.ok(!forbiddenMailKeys.has(key.toLowerCase()), `forbidden mail key: ${key}`);
      visit(nested);
    }
  };
  visit(state);
  visit(dispositionLedger);
});

test("direction filtering cannot retain an out-of-filter detail card", () => {
  const jobs = [
    { id: "quant-role", directions: ["Quant"] },
    { id: "ml-role", directions: ["AI/ML"] },
  ];
  const quantJobs = jobs.filter((job) =>
    jobMatchesDirection(job.directions, "Quant"),
  );

  assert.deepEqual(quantJobs.map((job) => job.id), ["quant-role"]);
  assert.equal(selectVisibleJob(quantJobs, "ml-role")?.id, "quant-role");
});

test("company career expansion prioritizes bounded unaudited companies", () => {
  const queue = buildCompanyCareerQueue(
    [
      { company: "LargeCo", directions: ["Quant"] },
      { company: "QuantCo", directions: ["Quant"] },
      { company: "SoftwareCo", directions: ["SWE/Data Infra"] },
    ],
    {
      baseline: {
        maxCompaniesPerRun: 20,
        companyStates: {},
        deferredLargeCompanies: [{ company: "LargeCo" }],
      },
    },
    new Date("2026-08-21T08:00:00Z"),
  );

  assert.deepEqual(
    queue.selectedCompanies.map((entry) => entry.company),
    ["QuantCo", "SoftwareCo"],
  );
  assert.equal(queue.deferredLargeCompanyCount, 1);
});
