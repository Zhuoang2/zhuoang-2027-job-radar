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
  assert.match(html, /Optiver/);
  assert.match(html, /查看官方岗位/);
  assert.match(html, /name="robots" content="noindex, nofollow"/i);
});

test("keeps the public job dataset complete and privacy-safe", async () => {
  const [jobsText, stateText] = await Promise.all([
    readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
  ]);

  const jobs = JSON.parse(jobsText);
  const state = JSON.parse(stateText);
  assert.ok(jobs.length >= 20);
  assert.equal(state.seenCanonicalUrls.length, state.baselineEntryCount);
  assert.ok(state.baselineEntryCount >= jobs.length);
  assert.ok(
    jobs.every(
      (job) =>
        job.applyUrl.startsWith("https://") &&
        ["confirmed-2027", "timing-check"].includes(job.startTiming) &&
        ["confirmed", "opt-accepted", "unknown"].includes(job.sponsorship),
    ),
  );
  assert.doesNotMatch(
    `${jobsText}\n${stateText}`,
    /@stanford\.edu|comstock|date of birth|birthday|phone number/i,
  );
});
