import { readFile, writeFile } from "node:fs/promises";

const [leadPath, outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error(
    "Usage: node scripts/fetch-swelist-public-leads.mjs <public-leads-json> <output-json>",
  );
}

const source = JSON.parse(await readFile(leadPath, "utf8"));
const leads = source.publicLeads;

function publicPosting(posting, leadUrl) {
  return {
    leadUrl,
    title: posting.title,
    subtitles: posting.subtitles ?? [],
    company: posting.job?.company?.name ?? null,
    locations: (posting.locations ?? []).map((location) => location.value),
    functions: (posting.functions ?? []).map((item) => item.title),
    startDate: posting.start_date ?? null,
    updatedDate: posting.updated_date ?? null,
    endDate: posting.end_date ?? null,
    active: posting.active ?? null,
    visible: posting.visible ?? null,
    archived: posting.archive ?? null,
    entryLevel: posting.entry_level ?? null,
    junior: posting.junior ?? null,
    sponsorsH1b: posting.sponsors_h1b ?? null,
    trackedObject: posting.tracked_obj ?? null,
    clickUrl: posting.url ?? null,
  };
}

async function fetchLead(lead) {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(lead.leadUrl, {
        redirect: "follow",
        headers: {
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0 (compatible; JobRadarPublicAudit/1.0)",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const nextData = html.match(
        /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
      )?.[1];
      if (!nextData) throw new Error("missing public structured job data");
      const posting = JSON.parse(nextData).props?.pageProps?.jobPosting;
      if (!posting) throw new Error("missing public job posting");
      return publicPosting(posting, lead.leadUrl);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { leadUrl: lead.leadUrl, error: lastError };
}

const results = [];
const concurrency = 16;
for (let index = 0; index < leads.length; index += concurrency) {
  results.push(
    ...(await Promise.all(leads.slice(index, index + concurrency).map(fetchLead))),
  );
  if (results.length % 64 === 0 || results.length === leads.length) {
    console.log(`Fetched ${results.length}/${leads.length}`);
  }
}

await writeFile(
  outputPath,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    windowStart: source.windowStart,
    windowEndExclusive: source.windowEndExclusive,
    matchedMessageCount: source.matchedMessageCount,
    results,
  }, null, 2)}\n`,
);

console.log(JSON.stringify({
  total: results.length,
  parsed: results.filter((result) => !result.error).length,
  failed: results.filter((result) => result.error).length,
  active: results.filter((result) => result.active === true && result.endDate === null).length,
}, null, 2));
