import { readFile, writeFile } from "node:fs/promises";

const [speedyPath, vanshbPath, simplifyPath, swelistPath, outputPath] =
  process.argv.slice(2);

if (!outputPath) {
  throw new Error(
    "Usage: node scripts/audit-backfill-candidates.mjs <speedy> <vanshb> <simplify> <swelist-json> <output-json>",
  );
}

const [speedyText, vanshbText, simplifyText, swelistText, jobsText, stateText] =
  await Promise.all([
    readFile(speedyPath, "utf8"),
    readFile(vanshbPath, "utf8"),
    readFile(simplifyPath, "utf8"),
    readFile(swelistPath, "utf8"),
    readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
    readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
  ]);

const jobs = JSON.parse(jobsText);
const state = JSON.parse(stateText);
const swelist = JSON.parse(swelistText);

function plainText(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  if (!value?.startsWith("http")) return value;
  const url = new URL(value.replace(/&amp;/g, "&"));
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["ref", "source", "spread", "embed"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function identityKeys(value) {
  const normalized = normalizeUrl(value);
  if (!normalized?.startsWith("http")) return [];
  const url = new URL(normalized);
  const identityHost = url.hostname.replace(/^www\./, "");
  const keys = new Set([normalized]);
  const pathTokens = url.pathname.split("/").filter(Boolean);
  const greenhouseId = url.searchParams.get("gh_jid");
  if (greenhouseId) keys.add(`${identityHost}:${greenhouseId.toLowerCase()}`);
  const likelyIds = pathTokens.filter((token) =>
    /^\d{5,}$/.test(token) ||
    /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(token) ||
    /^(?:JR|R|REQ|REQ_|R-)\w[\w-]*$/i.test(token),
  );
  for (const id of likelyIds) keys.add(`${identityHost}:${id.toLowerCase()}`);
  return [...keys];
}

function comparableText(value) {
  return value
    .toLowerCase()
    .replace(/\b(2027|start|grads?|graduates?|entry[- ]level|junior)\b/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyRoleKey(company, role) {
  return `${comparableText(company)}::${comparableText(role)}`;
}

function parseSpeedy(text) {
  let previousCompany = "";
  return text.split("\n").flatMap((line) => {
      if (!/^\|/.test(line)) return [];
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 6) return [];
      const companyCell = plainText(cells[0]);
      if (companyCell && companyCell !== "↳") previousCompany = companyCell;
      const company = companyCell === "↳" ? previousCompany : companyCell;
      const role = plainText(cells[1]);
      const location = plainText(cells[2]);
      const urls = [...cells[4].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      const age = Number.parseInt(cells[5], 10);
      if (!Number.isFinite(age) || age > 60 || urls.length === 0) return [];
      return [{ source: "speedyapply", company, role, location, ageDays: age, url: normalizeUrl(urls[0]) }];
    });
}

function parseVanshb(text) {
  return text
    .split("\n")
    .filter((line) => /^\|\s*\*\*/.test(line))
    .flatMap((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 5) return [];
      const company = plainText(cells[0]).replace(/^\*\*|\*\*$/g, "");
      const role = plainText(cells[1]);
      const location = plainText(cells[2]);
      const urls = [...cells[3].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      const dateLabel = plainText(cells[4]);
      if (urls.length === 0) return [];
      const parsedDate = new Date(`${dateLabel} 2026 12:00:00 GMT-0700`);
      const windowStart = new Date("2026-06-21T00:00:00-07:00");
      const windowEnd = new Date("2026-08-21T00:00:00-07:00");
      if (!(parsedDate >= windowStart && parsedDate < windowEnd)) return [];
      const ageDays = Math.floor((new Date("2026-08-20T12:00:00-07:00") - parsedDate) / 86400000);
      return [{ source: "vanshb03", company, role, location, dateLabel, ageDays, url: normalizeUrl(urls[0]) }];
    });
}

function parseSimplify(text) {
  return [...text.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length !== 5) return [];
    const company = plainText(cells[0]).replace(/^🔥\s*/, "");
    const role = plainText(cells[1]);
    const location = plainText(cells[2]);
    const urls = [...cells[3].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const officialUrl = urls.find((url) => !url.includes("simplify.jobs/p/"));
    const simplifyUrl = urls.find((url) => url.includes("simplify.jobs/p/"));
    const age = Number.parseInt(plainText(cells[4]), 10);
    if (!Number.isFinite(age) || age > 60 || !officialUrl) return [];
    return [{
      source: "simplifyjobs",
      company,
      role,
      location,
      ageDays: age,
      url: normalizeUrl(officialUrl),
      leadUrl: simplifyUrl ? normalizeUrl(simplifyUrl) : undefined,
    }];
  });
}

const relevantTitle = /\b(software|developer|development|machine learning|\bml\b|artificial intelligence|\bai\b|data (engineer|scientist|analyst)|backend|back-end|infrastructure|quant|algorithm|research (scientist|engineer)|applied scientist|full[- ]?stack|front[- ]?end|mobile engineer|devops|site reliability|distributed systems|cloud engineer)\b/i;
const obviousOutOfScope = /\b(intern(ship)?|product manager|program manager|hardware|electrical|mechanical|manufacturing|silicon|asic|fpga|verification engineer|security engineer|cyber|firmware|embedded|test engineer|quality assurance|solutions? engineer|sales engineer|support engineer|business analyst|accountant)\b/i;

function titleDisposition(candidate) {
  if (!relevantTitle.test(candidate.role)) return "out-of-scope-title";
  if (obviousOutOfScope.test(candidate.role)) return "out-of-scope-title";
  if (candidate.source === "simplifyjobs" && !/2027/i.test(candidate.role + " " + candidate.url)) {
    return "monitor-2026-cycle";
  }
  if (candidate.source === "vanshb03" && !/2027/i.test(candidate.role + " " + candidate.url)) {
    return "needs-official-2027-evidence";
  }
  return "official-review";
}

const knownUrls = new Set();
const knownIdentities = new Set();
const knownCompanyRoles = new Set(
  jobs.map((job) => companyRoleKey(job.company, job.role)),
);
function rememberUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return;
  knownUrls.add(normalized);
  for (const key of identityKeys(normalized)) knownIdentities.add(key);
}
for (const job of jobs) {
  rememberUrl(job.canonicalUrl);
  rememberUrl(job.applyUrl);
  for (const alternate of job.alternateApplyUrls ?? []) rememberUrl(alternate.url);
}
for (const listName of [
  "hardEligibilityExclusions",
  "preferenceExclusions",
  "officialVerificationNeedsReview",
]) {
  for (const item of state.sourceMonitoring[listName] ?? []) {
    rememberUrl(item.canonicalUrl);
  }
}
for (const duplicate of state.sourceMonitoring.suspectedDuplicates ?? []) {
  rememberUrl(duplicate.currentCanonicalUrl);
  for (const url of duplicate.possiblePriorCanonicalUrls ?? []) rememberUrl(url);
}

const repositoryCandidates = [
  ...parseSpeedy(speedyText),
  ...parseVanshb(vanshbText),
  ...parseSimplify(simplifyText),
].map((candidate) => ({
  ...candidate,
  known:
    knownUrls.has(candidate.url) ||
    identityKeys(candidate.url).some((key) => knownIdentities.has(key)) ||
    knownCompanyRoles.has(companyRoleKey(candidate.company, candidate.role)),
  preliminaryDisposition: titleDisposition(candidate),
}));

const bySource = Object.fromEntries(
  ["speedyapply", "vanshb03", "simplifyjobs"].map((source) => {
    const rows = repositoryCandidates.filter((candidate) => candidate.source === source);
    return [source, {
      scanned: rows.length,
      known: rows.filter((candidate) => candidate.known).length,
      officialReview: rows.filter((candidate) => !candidate.known && candidate.preliminaryDisposition === "official-review").length,
      needsOfficial2027Evidence: rows.filter((candidate) => !candidate.known && candidate.preliminaryDisposition === "needs-official-2027-evidence").length,
      outOfScopeTitle: rows.filter((candidate) => !candidate.known && candidate.preliminaryDisposition === "out-of-scope-title").length,
      monitor2026Cycle: rows.filter((candidate) => !candidate.known && candidate.preliminaryDisposition === "monitor-2026-cycle").length,
    }];
  }),
);

const output = {
  generatedAt: new Date().toISOString(),
  window: { start: "2026-06-21", endExclusive: "2026-08-21", timeZone: "America/Los_Angeles" },
  swelist: { matchedMessageCount: swelist.messageCount, publicLeadCount: swelist.leads.length },
  bySource,
  candidates: repositoryCandidates,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ swelist: output.swelist, bySource }, null, 2));
