import { readFile, writeFile } from "node:fs/promises";
import { classifyTimingEvidence } from "./job-timing-policy.mjs";

const [outputPath, ...inputPaths] = process.argv.slice(2);
if (!outputPath || inputPaths.length === 0) {
  throw new Error("Usage: node scripts/verify-daily-source-candidates.mjs <output-json> <delta-json> [...]");
}

const deltas = await Promise.all(inputPaths.map((path) => readFile(path, "utf8").then(JSON.parse)));

function canonicalUrl(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|gh_src|source|ref|iis|iisn|lever-source|__jv|trk|tracking|ats|mobile|needsRedirect)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function stripHtml(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const closedSignal = /\b(?:job (?:is )?no longer available|position (?:has been )?filled|position (?:is )?closed|posting (?:has )?expired|no longer accepting applications|this job has expired|job you(?:'re| are) looking for is now closed)\b/i;
const incompatibleExperience = /\b(?:minimum(?: of)?|at least|requires?|must have)\s+(?:[4-9]|[1-9]\d)\+?\s+years?\b|\b(?:[4-9]|[1-9]\d)\+\s+years?\s+(?:of\s+)?(?:professional|industry|relevant|software|engineering|experience)\b/i;
const citizenshipRestriction = /\b(?:must be (?:a )?U\.?S\.? citizen|U\.?S\.? citizenship (?:is )?required|only U\.?S\.? citizens|active (?:security |secret |top secret |TS\/SCI(?: with polygraph| poly)? )?clearance (?:is )?required|(?:secret|top secret|TS\/SCI)(?: level)? clearance(?: with polygraph)? is required|(?:must|required to) (?:hold|possess|maintain|obtain) (?:an? )?(?:active )?(?:security |secret |top secret |TS\/SCI(?: poly)? )?clearance|must be (?:a )?U\.?S\.? person|ITAR[^.]{0,180}U\.?S\.? person)\b/i;
const noSponsorship = /\b(?:will not (?:provide|offer|sponsor)|does not (?:provide|offer|sponsor)|do not (?:provide|offer|sponsor)|unable to (?:provide|offer|sponsor)|no (?:visa )?sponsorship|without (?:current or future )?sponsorship|do not require visa sponsorship now or in the future|must not require (?:current or future )?sponsorship|not eligible for (?:visa )?sponsorship|may not be able to employ[^.]{0,180}support future H-?1B sponsorship)\b/i;
const ambiguousAuthorization = /\b(?:U\.?S\.? citizen,? green card,? or long[- ]term visa|citizen(?:ship)? or permanent resident or long[- ]term visa)\b/i;
const outOfScopeTitle = /\b(?:intern(?:ship)?|co[- ]?op|firmware|embedded|ASIC|FPGA|hardware verification|security engineer|test engineer|quality assurance)\b/i;
const coreSystemsPreference = /\b(?:kernel|operating system internals|OS internals|Linux fleet|network stack|storage systems?|Nix|RPM package|systems package management)\b/i;
const usLocation = /\b(?:United States|USA|Remote(?:\s*in\s*USA)?|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;

async function fetchText(url) {
  const headers = { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 JobRadar/1.0" };
  const parsed = new URL(url);
  try {
    if (parsed.hostname === "jobs.ashbyhq.com") {
      const [slug, id] = parsed.pathname.split("/").filter(Boolean);
      const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
        headers: { accept: "application/json", "user-agent": "JobRadar/1.0" }, signal: AbortSignal.timeout(25000),
      });
      const data = await response.json();
      const posting = (data.jobs ?? []).find((job) => job.id === id || job.jobUrl?.includes(id) || job.applyUrl?.includes(id));
      const text = stripHtml(`${posting?.title ?? ""} ${posting?.location ?? ""} ${posting?.descriptionPlain ?? posting?.descriptionHtml ?? ""}`);
      if (response.ok && text.length >= 250) return { ok: true, statusCode: response.status, finalUrl: posting?.jobUrl ?? url, text, method: "ashby-api" };
    }
    if (/\.myworkdayjobs\.com$/.test(parsed.hostname)) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (/^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? "")) parts.shift();
      const site = parts.shift();
      const externalPath = `/${parts.join("/")}`;
      const tenant = parsed.hostname.split(".")[0];
      if (site && externalPath.startsWith("/job/")) {
        const response = await fetch(`https://${parsed.hostname}/wday/cxs/${tenant}/${site}${externalPath}`, {
          headers: { accept: "application/json", "user-agent": "JobRadar/1.0" }, signal: AbortSignal.timeout(25000),
        });
        const data = await response.json();
        const posting = data.jobPostingInfo ?? data;
        const text = stripHtml(`${posting.title ?? ""} ${posting.location ?? ""} ${posting.jobDescription ?? posting.description ?? ""}`);
        if (response.ok && text.length >= 250) return { ok: true, statusCode: response.status, finalUrl: posting.externalUrl ?? url, text, method: "workday-api" };
      }
    }
  } catch {}
  try {
    const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const html = await response.text();
    const text = stripHtml(html);
    if (response.ok && text.length >= 600) return { ok: true, statusCode: response.status, finalUrl: response.url, text, method: "direct" };
  } catch {}
  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readerUrl, { headers: { accept: "text/plain", "user-agent": "JobRadar/1.0" }, signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    if (response.ok && text.length >= 600) return { ok: true, statusCode: response.status, finalUrl: url, text, method: "jina" };
    return { ok: false, statusCode: response.status, finalUrl: url, text, method: "jina" };
  } catch (error) {
    return { ok: false, error: error.message, finalUrl: url, text: "", method: "failed" };
  }
}

function classify(candidate, page) {
  if (!page.ok) return { status: "needs-review", reason: page.error ?? `http-${page.statusCode}` };
  const text = `${candidate.role} ${page.text}`;
  if (closedSignal.test(text)) return { status: "hard-excluded", reason: "official-page-closed" };
  if (!usLocation.test(candidate.location ?? "")) return { status: "needs-review", reason: "us-location-unconfirmed" };
  if (outOfScopeTitle.test(candidate.role)) return { status: "out-of-scope", reason: "out-of-scope-title" };
  if (incompatibleExperience.test(text)) return { status: "hard-excluded", reason: "experienced-role" };
  if (citizenshipRestriction.test(text)) return { status: "hard-excluded", reason: "citizenship-or-clearance-restriction" };
  if (noSponsorship.test(text)) return { status: "hard-excluded", reason: "no-future-sponsorship" };
  if (ambiguousAuthorization.test(text)) return { status: "needs-review", reason: "work-authorization-policy-ambiguous" };
  if (coreSystemsPreference.test(candidate.role)) return { status: "preference-excluded", reason: "preference-exclusion-core-systems" };
  const timing = classifyTimingEvidence({ title: candidate.role, description: page.text, employmentType: "full-time" });
  if (timing.status === "exclude") return { status: "hard-excluded", reason: timing.reasonCode };
  if (timing.status === "needs-review") return { status: "needs-review", reason: timing.reasonCode };
  return { status: "eligible", reason: timing.reasonCode, timingStatus: timing.status };
}

const byUrl = new Map();
for (const delta of deltas) {
  for (const row of [...delta.added, ...delta.changed.map((item) => item.after)]) {
    const url = canonicalUrl(row.url);
    const existing = byUrl.get(url);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, delta.source])];
    } else {
      byUrl.set(url, { ...row, url, sources: [delta.source] });
    }
  }
}

const candidates = [...byUrl.values()];
const verified = new Array(candidates.length);
let cursor = 0;
async function worker() {
  while (cursor < candidates.length) {
    const index = cursor++;
    const candidate = candidates[index];
    const page = await fetchText(candidate.url);
    verified[index] = {
      ...candidate,
      officialUrl: page.finalUrl ?? candidate.url,
      officialCheck: { ok: page.ok, statusCode: page.statusCode ?? null, method: page.method, characters: page.text.length, error: page.error ?? null },
      disposition: classify(candidate, page),
      evidenceText: page.text.slice(0, 12000),
    };
  }
}
await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, worker));

const counts = verified.reduce((summary, item) => {
  summary[item.disposition.status] = (summary[item.disposition.status] ?? 0) + 1;
  return summary;
}, {});
const result = { generatedAt: new Date().toISOString(), inputCount: candidates.length, counts, candidates: verified };
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ generatedAt: result.generatedAt, inputCount: result.inputCount, counts, outputPath }, null, 2));
