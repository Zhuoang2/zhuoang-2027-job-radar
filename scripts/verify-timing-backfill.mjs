import { mkdir, readFile, writeFile } from "node:fs/promises";
import { classifyTimingEvidence } from "./job-timing-policy.mjs";

const closedSignal = /\b(?:job (?:is )?no longer available|position (?:has been )?filled|position (?:is )?closed|posting (?:has )?expired|no longer accepting applications|this job has expired|job you(?:'re| are) looking for is now closed)\b/i;
const internshipSignal = /\b(?:intern(?:ship)?|co[- ]?op)\b/i;
const experiencedTitle = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect)\b/i;
const incompatibleExperience = /\b(?:minimum(?: of)?|at least|requires?|must have)\s+(?:[4-9]|[1-9]\d)\+?\s+years?\b|\b(?:[4-9]|[1-9]\d)\+\s+years?\s+(?:of\s+)?(?:professional|industry|relevant|software|engineering|experience)\b/i;
const citizenshipRestriction = /\b(?:must be (?:a )?U\.?S\.? citizen|requires? (?:all )?candidates? to be U\.?S\.? citizens?|U\.?S\.? citizens?hip (?:is )?required|citizenship required for clearance purposes|only U\.?S\.? citizens|active (?:security |secret |top secret |TS\/SCI(?: with polygraph| poly)? )?clearance (?:is )?required|(?:secret|top secret|TS\/SCI)(?: level)? clearance(?: with polygraph)? is required|(?:must|required to) (?:hold|possess|maintain|obtain) (?:an? )?(?:active )?(?:security |secret |top secret |TS\/SCI(?: poly)? )?clearance|must have at least an interim secret|willingness and ability to obtain (?:a )?(?:high[- ]level )?security clearance|must be (?:a )?['\"“”]?U\.?S\.? person|ITAR[^.]{0,180}U\.?S\.? person)\b/i;
const ambiguousWorkAuthorization = /\b(?:U\.?S\.? citizen,? green card,? or long[- ]term visa|citizen(?:ship)? or permanent resident or long[- ]term visa)\b/i;
const noSponsorship = /\b(?:will not (?:provide|offer|sponsor)|does not (?:provide|offer|sponsor)|do not (?:provide|offer|sponsor)|unable to (?:provide|offer|sponsor)|no (?:visa )?sponsorship|without (?:current or future )?sponsorship|do not require visa sponsorship now or in the future|must not require (?:current or future )?sponsorship|not eligible for (?:visa )?sponsorship|may not be able to employ[^.]{0,180}support future H-?1B sponsorship)\b/i;
const lowLevelPreferenceExclusion = /\b(?:kernel|operating system internals|OS internals|Linux fleet|network stack|storage systems?|Nix|RPM package|systems package management)\b/i;
const phDOnlyRole = /\((?:ph\.?d|doctoral)\)|\b(?:ph\.?d|doctoral) graduate\b/i;
const coreEmbeddedRole = /\b(?:embedded software for real-time control|embedded real[- ]time operating systems?|firmware development)\b/i;
const relevantTitle = /\b(?:software|machine learning|\bml\b|artificial intelligence|\bai\b|data (?:engineer|scientist|analyst)|backend|back[- ]?end|infrastructure|quant(?:itative)?|research (?:scientist|engineer)|applied scientist|developer|engineer)\b/i;
const outOfScopeTitle = /\b(?:intern(?:ship)?|co[- ]?op|front[- ]?end|mobile|ios|android|product manager|designer|sales|marketing|firmware|embedded|flight test|test flight|geospatial|security engineer|test engineer|quality assurance)\b/i;
const pureTraderTitle = /\b(?:trader|trading associate|market maker)\b/i;
const nonUsLocation = /\b(?:United Kingdom|\bUK\b|Canada|Toronto|Vancouver|India|Singapore|Australia|Sydney|Europe|Berlin|Paris|Amsterdam|Dublin|Tokyo|Hong Kong|China|Mexico)\b/i;
const usLocation = /\b(?:United States|US|USA|Remote(?:\s*[-–]\s*US)?|New York|Chicago|California|San Francisco|San Jose|Seattle|Boston|Austin|Texas|Palo Alto|Menlo Park|Washington|Massachusetts|Illinois|Connecticut|Florida|Virginia|Pennsylvania|Colorado|Arizona|Georgia|North Carolina|New Jersey|Ohio|Maryland|Utah|Oregon|Michigan|Missouri|Minnesota|Wisconsin|Tennessee|Indiana|Iowa|Kansas|Nevada|Delaware|Rhode Island|New Hampshire|Vermont|Maine|Idaho|Montana|Wyoming|Nebraska|Oklahoma|Arkansas|Louisiana|Mississippi|Alabama|South Carolina|West Virginia|Kentucky|New Mexico|North Dakota|South Dakota|Alaska|Hawaii|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

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

async function fetchPage(candidate) {
  try {
    const response = await fetch(candidate.url, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 JobRadar/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    const html = await response.text();
    const text = stripHtml(html);
    return { ok: response.ok, statusCode: response.status, finalUrl: response.url, text, bytes: html.length };
  } catch (error) {
    return { ok: false, error: error.message, text: "", bytes: 0 };
  }
}

function disposition(candidate, page) {
  if (!page.ok) return { status: "needs-review", reason: page.error ?? `http-${page.statusCode}` };
  if (page.bytes < 500 || page.text.length < 250) return { status: "needs-review", reason: "official-page-content-unavailable" };
  const text = `${candidate.role} ${page.text}`;
  if (closedSignal.test(text)) return { status: "excluded", reason: "official-page-closed" };
  if (!relevantTitle.test(candidate.role) || outOfScopeTitle.test(candidate.role)) return { status: "excluded", reason: "out-of-scope-title" };
  if (internshipSignal.test(candidate.role)) return { status: "excluded", reason: "internship" };
  if (pureTraderTitle.test(candidate.role) && !/\b(?:research|developer|engineer|software|quantitative strategy)\b/i.test(candidate.role)) {
    return { status: "excluded", reason: "pure-trading-role" };
  }
  const location = candidate.location ?? "";
  if (!location.trim()) return { status: "needs-review", reason: "missing-location-evidence" };
  if (nonUsLocation.test(location) && !usLocation.test(location)) return { status: "excluded", reason: "non-us-location" };
  if (!usLocation.test(location)) return { status: "needs-review", reason: "us-location-unconfirmed" };
  if (experiencedTitle.test(candidate.role) || incompatibleExperience.test(text)) return { status: "excluded", reason: "experienced-role" };
  if (phDOnlyRole.test(text)) return { status: "excluded", reason: "phd-required" };
  if (citizenshipRestriction.test(text)) return { status: "excluded", reason: "citizenship-or-clearance-restriction" };
  if (ambiguousWorkAuthorization.test(text)) return { status: "needs-review", reason: "work-authorization-policy-ambiguous" };
  if (noSponsorship.test(text)) return { status: "excluded", reason: "no-future-sponsorship" };
  if (coreEmbeddedRole.test(text)) return { status: "excluded", reason: "preference-exclusion-core-embedded-systems" };
  if (lowLevelPreferenceExclusion.test(candidate.role)) return { status: "excluded", reason: "preference-exclusion-core-systems" };
  const timing = classifyTimingEvidence({ title: candidate.role, description: page.text, employmentType: "full-time" });
  if (timing.status === "exclude") return { status: "excluded", reason: timing.reasonCode };
  if (timing.status === "needs-review") return { status: "needs-review", reason: timing.reasonCode };
  return { status: "eligible", timingStatus: timing.status, reason: timing.reasonCode };
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

const root = new URL("../", import.meta.url);
const review = JSON.parse(await readFile(new URL("work/timing-backfill-review.json", root), "utf8"));
const input = [...review.candidates, ...review.officialReview];
const verified = await mapLimit(input, 8, async (candidate) => {
  const page = await fetchPage(candidate);
  const result = disposition(candidate, page);
  return {
    ...candidate,
    officialUrl: page.finalUrl ?? candidate.url,
    officialCheck: { ok: page.ok, statusCode: page.statusCode ?? null, bytes: page.bytes, error: page.error ?? null },
    disposition: result,
  };
});
const counts = verified.reduce((summary, item) => {
  summary[item.disposition.status] = (summary[item.disposition.status] ?? 0) + 1;
  return summary;
}, {});
const reasonCounts = verified.reduce((summary, item) => {
  summary[item.disposition.reason] = (summary[item.disposition.reason] ?? 0) + 1;
  return summary;
}, {});
const result = {
  generatedAt: new Date().toISOString(),
  windowStart: review.windowStart,
  windowEndExclusive: review.windowEndExclusive,
  inputCount: input.length,
  counts,
  reasonCounts,
  eligible: verified.filter((item) => item.disposition.status === "eligible"),
  needsReview: verified.filter((item) => item.disposition.status === "needs-review"),
  excluded: verified.filter((item) => item.disposition.status === "excluded"),
};
await mkdir(new URL("work/", root), { recursive: true });
await writeFile(new URL("work/timing-backfill-verified.json", root), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ generatedAt: result.generatedAt, inputCount: result.inputCount, counts, reasonCounts, report: "work/timing-backfill-verified.json" }, null, 2));
