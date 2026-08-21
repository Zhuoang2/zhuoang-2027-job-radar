import { readFile, writeFile } from "node:fs/promises";

const [auditPath, outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error(
    "Usage: node scripts/fetch-official-candidates.mjs <audit-json> <output-json>",
  );
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const candidates = audit.candidates.filter(
  (candidate) =>
    !candidate.known && candidate.preliminaryDisposition === "official-review",
);

function decodeText(html) {
  return html
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\n/g, "\n")
    .replace(/<script[^>]*>/gi, "\n")
    .replace(/<\/script>/gi, "\n")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function excerpts(text, expression, radius = 240, limit = 5) {
  const flags = expression.flags.includes("g") ? expression.flags : `${expression.flags}g`;
  const matcher = new RegExp(expression.source, flags);
  const results = [];
  for (const match of text.matchAll(matcher)) {
    const start = Math.max(0, match.index - radius);
    const end = Math.min(text.length, match.index + match[0].length + radius);
    results.push(text.slice(start, end).replace(/\s+/g, " ").trim());
    if (results.length >= limit) break;
  }
  return [...new Set(results)];
}

async function fetchCandidate(candidate) {
  const candidateUrl = candidate.url ?? candidate.clickUrl;
  try {
    if (!candidateUrl) throw new Error("missing public candidate URL");
    const response = await fetch(candidateUrl, {
      redirect: "follow",
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; JobRadarPublicAudit/1.0)",
      },
      signal: AbortSignal.timeout(30000),
    });
    const html = await response.text();
    const text = decodeText(html);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .trim();
    return {
      ...candidate,
      requestedUrl: candidateUrl,
      fetchedUrl: response.url,
      httpStatus: response.status,
      pageTitle: title ?? null,
      byteCount: html.length,
      closedEvidence: excerpts(text, /no longer available|job has been filled|position has been filled|job is closed|page not found|404 not found/i, 160, 3),
      timingEvidence: excerpts(text, /2027|new grad(?:uate)?|early career|entry[- ]level|recent(?:ly)? (?:completed|graduate)/i),
      responsibilityEvidence: excerpts(text, /responsibilities|what you(?:'|’)ll do|the role|job description/i, 300, 3),
      qualificationEvidence: excerpts(text, /minimum qualifications|basic qualifications|required qualifications|what you(?:'|’)ll bring|requirements/i, 320, 4),
      experienceEvidence: excerpts(text, /\b\d+\+?\s*(?:-|to)?\s*\d*\s*years?\b|years? of (?:professional |relevant )?experience/i, 220, 5),
      sponsorshipEvidence: excerpts(text, /sponsor(?:ship)?|visa|work authorization|authorized to work|citizen(?:ship)?|security clearance|export control|u\.s\. person/i, 260, 5),
      degreeEvidence: excerpts(text, /bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|degree/i, 220, 4),
    };
  } catch (error) {
    return {
      ...candidate,
      requestedUrl: candidateUrl,
      httpStatus: null,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = [];
for (let index = 0; index < candidates.length; index += 6) {
  results.push(...(await Promise.all(candidates.slice(index, index + 6).map(fetchCandidate))));
  console.log(`Fetched ${Math.min(index + 6, candidates.length)}/${candidates.length}`);
}

await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);

const summary = {
  total: results.length,
  ok: results.filter((result) => result.httpStatus === 200).length,
  failed: results.filter((result) => result.httpStatus !== 200).length,
  closedEvidence: results.filter((result) => result.closedEvidence?.length).length,
  explicit2027: results.filter((result) => result.timingEvidence?.some((value) => /2027/i.test(value))).length,
  sponsorshipOrRestrictionEvidence: results.filter((result) => result.sponsorshipEvidence?.length).length,
};
console.log(JSON.stringify(summary, null, 2));
