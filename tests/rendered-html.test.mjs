import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(html, /申请记录/);
  assert.match(html, /Optiver/);
  assert.match(html, /查看官方岗位/);
  assert.match(html, /标记为已提交/);
  assert.doesNotMatch(html, /DV Trading/);
  assert.doesNotMatch(html, /已记录提交/);
  assert.match(html, /name="robots" content="noindex, nofollow"/i);
});

test("keeps the public job and application datasets privacy-safe", async () => {
  const [jobsText, stateText, applicationsText, automationText] = await Promise.all([
    readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
    readFile(new URL("../data/applications.json", import.meta.url), "utf8"),
    readFile(new URL("../AUTOMATION.md", import.meta.url), "utf8"),
  ]);

  const jobs = JSON.parse(jobsText);
  const state = JSON.parse(stateText);
  const applications = JSON.parse(applicationsText);
  assert.ok(jobs.length >= 20);
  assert.equal(state.seenCanonicalUrls.length, state.baselineEntryCount);
  assert.ok(state.baselineEntryCount >= jobs.length);
  assert.deepEqual(state.sourceMonitoring.scanOrder, [
    "swelist-email",
    "speedyapply",
    "vanshb03",
    "simplifyjobs",
  ]);
  assert.equal(state.sourceMonitoring.sources["swelist-email"].role, "email-lead");
  assert.equal(
    state.sourceMonitoring.sources["swelist-email"].baseline.mode,
    "normalized-public-candidate-urls",
  );
  assert.equal(state.sourceMonitoring.sources.speedyapply.role, "primary");
  assert.equal(state.sourceMonitoring.sources.vanshb03.role, "supplemental");
  assert.equal(state.sourceMonitoring.sources.simplifyjobs.role, "monitor");
  assert.ok(Array.isArray(state.sourceMonitoring.suspectedDuplicates));
  assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
  assert.equal(new Set(jobs.map((job) => job.canonicalUrl)).size, jobs.length);
  assert.match(
    automationText,
    /isolated official-page access failure as a candidate-level verification failure/i,
  );
  assert.ok(Array.isArray(state.sourceMonitoring.officialVerificationNeedsReview));
  assert.ok(
    state.sourceMonitoring.officialVerificationNeedsReview.every(
      (candidate) =>
        candidate.status === "needs-review" &&
        !jobs.some((job) => job.canonicalUrl === candidate.canonicalUrl),
    ),
  );
  assert.ok(
    jobs.every(
      (job) =>
        job.applyUrl.startsWith("https://") &&
        ["confirmed-2027", "timing-check"].includes(job.startTiming) &&
        ["confirmed", "opt-accepted", "unknown"].includes(job.sponsorship),
    ),
  );
  assert.ok(Array.isArray(applications.applications));
  assert.ok(
    applications.applications.some(
      (application) =>
        application.id === "dv-trading-2027-graduate-swe-4719126005" &&
        application.status === "submitted",
    ),
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
        ["applying", "needs-review", "submitted", "paused"].includes(
          application.status,
        )
      );
    }),
  );
  assert.doesNotMatch(
    `${jobsText}\n${stateText}\n${applicationsText}`,
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
});
