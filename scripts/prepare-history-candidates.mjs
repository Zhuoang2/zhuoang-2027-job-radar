import { readFile, writeFile } from "node:fs/promises";

const [outputPath, ...inputPaths] = process.argv.slice(2);
if (!outputPath || inputPaths.length === 0) {
  throw new Error(
    "Usage: node scripts/prepare-history-candidates.mjs <output-json> <history-json>...",
  );
}

const [ledgerText, jobsText, stateText, ...historyTexts] = await Promise.all([
  readFile(new URL("../data/candidate-dispositions.json", import.meta.url), "utf8"),
  readFile(new URL("../data/jobs.json", import.meta.url), "utf8"),
  readFile(new URL("../data/source-state.json", import.meta.url), "utf8"),
  ...inputPaths.map((path) => readFile(path, "utf8")),
]);
const ledger = JSON.parse(ledgerText).candidates;
const jobs = JSON.parse(jobsText);
const state = JSON.parse(stateText);
const histories = historyTexts.map(JSON.parse);

function normalizeUrl(value) {
  if (!value?.startsWith("http")) return value;
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["embed", "ref", "source", "spread"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function identityTokens(value) {
  return [
    ...new Set(
      decodeURIComponent(value ?? "")
        .toLowerCase()
        .match(/[0-9a-f]{8}-[0-9a-f-]{20,}|\b\d{5,}\b|\b(?:jr|rq|req|r)-?_?\d{4,}\b/gi) ?? [],
    ),
  ];
}

const knownUrls = new Set(Object.keys(ledger).map(normalizeUrl));
const knownTokens = new Set([
  ...Object.keys(ledger),
  ...jobs.flatMap((job) => [
    job.canonicalUrl,
    job.applyUrl,
    ...(job.alternateApplyUrls ?? []).map((alternate) => alternate.url),
  ]),
  ...(state.sourceMonitoring.hardEligibilityExclusions ?? []).map((item) => item.canonicalUrl),
  ...(state.sourceMonitoring.preferenceExclusions ?? []).map((item) => item.canonicalUrl),
].flatMap(identityTokens));

const earlyCareerEvidence = /(2027|new grad|college grad|early career|entry[- ]level|engineer i\b|software engineer 1\b|junior|jr\.|associate|quantitative developer)/i;
const incompatibleEvidence = /(2025|2026|engineer ii\b|senior|manager)/i;
const targetTitle = /\b(software|developer|machine learning|\bml\b|artificial intelligence|\bai\b|data (engineer|scientist|analyst)|backend|infrastructure|quant|algorithm|research (scientist|engineer)|applied scientist)\b/i;
const excludedTitle = /\b(intern(ship)?|hardware|electrical|mechanical|manufacturing|silicon|asic|fpga|security|firmware|embedded|test engineer|quality assurance|product manager|program manager)\b/i;

const candidates = histories.flatMap((history) => history.candidates).filter((candidate) => {
  const url = normalizeUrl(candidate.url);
  if (knownUrls.has(url) || identityTokens(url).some((token) => knownTokens.has(token))) return false;
  const evidence = `${candidate.role} ${url}`;
  return (
    targetTitle.test(candidate.role) &&
    !excludedTitle.test(candidate.role) &&
    earlyCareerEvidence.test(evidence) &&
    !incompatibleEvidence.test(candidate.role)
  );
}).map((candidate) => ({
  ...candidate,
  url: normalizeUrl(candidate.url),
  known: false,
  preliminaryDisposition: "official-review",
}));

await writeFile(outputPath, `${JSON.stringify({ candidates }, null, 2)}\n`);
console.log(JSON.stringify({ candidateCount: candidates.length, outputPath }, null, 2));
