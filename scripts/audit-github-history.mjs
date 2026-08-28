import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [source, repositoryPath, filePath, outputPath, startArg, endArg] = process.argv.slice(2);
if (!outputPath || !["speedyapply", "vanshb03", "simplifyjobs"].includes(source)) {
  throw new Error(
    "Usage: node scripts/audit-github-history.mjs <speedyapply|vanshb03|simplifyjobs> <repository> <file> <output-json> [window-start] [window-end-exclusive]",
  );
}

const windowStart = startArg ?? "2026-07-29T00:00:00-07:00";
const windowEndExclusive = endArg ?? "2026-08-29T00:00:00-07:00";

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
      ["embed", "ref", "source", "spread"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function parseSpeedy(text) {
  let previousCompany = "";
  return text.split("\n").flatMap((line) => {
    if (!/^\|/.test(line)) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) return [];
    const companyCell = plainText(cells[0]);
    if (companyCell && companyCell !== "↳") previousCompany = companyCell;
    const urls = [...cells[4].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    if (urls.length === 0) return [];
    return [{
      company: companyCell === "↳" ? previousCompany : companyCell,
      role: plainText(cells[1]),
      location: plainText(cells[2]),
      url: normalizeUrl(urls[0]),
    }];
  });
}

function parseVanshb(text) {
  return text.split("\n").filter((line) => /^\|\s*\*\*/.test(line)).flatMap((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) return [];
    const urls = [...cells[3].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    if (urls.length === 0) return [];
    return [{
      company: plainText(cells[0]).replace(/^\*\*|\*\*$/g, ""),
      role: plainText(cells[1]),
      location: plainText(cells[2]),
      url: normalizeUrl(urls[0]),
    }];
  });
}

function parseSimplify(text) {
  let previousCompany = "";
  return [...text.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length !== 5) return [];
    const urls = [...cells[3].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const officialUrl = urls.find((url) => !url.includes("simplify.jobs/p/"));
    if (!officialUrl) return [];
    const companyCell = plainText(cells[0]).replace(/^🔥\s*/, "");
    if (companyCell && companyCell !== "↳") previousCompany = companyCell;
    return [{
      company: companyCell === "↳" ? previousCompany : companyCell,
      role: plainText(cells[1]),
      location: plainText(cells[2]),
      url: normalizeUrl(officialUrl),
    }];
  });
}

function parseRows(text) {
  if (source === "speedyapply") return parseSpeedy(text);
  if (source === "vanshb03") return parseVanshb(text);
  return parseSimplify(text);
}

const log = execFileSync(
  "git",
  [
    "-C",
    repositoryPath,
    "log",
    `--since=${windowStart}`,
    `--until=${windowEndExclusive}`,
    "--format=%H%x09%cI",
    "--",
    filePath,
  ],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);

const revisions = log.trim().split("\n").filter(Boolean).map((line) => {
  const [commit, committedAt] = line.split("\t");
  return { commit, committedAt };
});

// Simplify can update hundreds of times per month. For the one-time timing
// correction we only need roles that are still open now and were absent at
// the start of the window, so a boundary snapshot is both faster and safer
// than replaying every intermediate add/remove cycle.
if (source === "simplifyjobs" && revisions.length > 200) {
  const boundaryCommit = execFileSync(
    "git",
    ["-C", repositoryPath, "rev-list", "-1", `--before=${windowStart}`, "HEAD", "--", filePath],
    { encoding: "utf8" },
  ).trim();
  const currentCommit = execFileSync(
    "git",
    ["-C", repositoryPath, "rev-list", "-1", `--before=${windowEndExclusive}`, "HEAD", "--", filePath],
    { encoding: "utf8" },
  ).trim();
  const boundaryText = boundaryCommit
    ? execFileSync("git", ["-C", repositoryPath, "show", `${boundaryCommit}:${filePath}`], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 })
    : "";
  const currentText = currentCommit
    ? execFileSync("git", ["-C", repositoryPath, "show", `${currentCommit}:${filePath}`], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 })
    : "";
  const boundaryUrls = new Set(parseRows(boundaryText).map((row) => row.url));
  const currentSnapshotAt = currentCommit
    ? execFileSync("git", ["-C", repositoryPath, "show", "-s", "--format=%cI", currentCommit], { encoding: "utf8" }).trim()
    : new Date(new Date(windowEndExclusive).getTime() - 1).toISOString();
  const currentCandidates = parseRows(currentText)
    .filter((row) => !boundaryUrls.has(row.url))
    .map((row) => ({
      ...row,
      source,
      firstAddedAt: windowStart,
      lastAddedAt: currentSnapshotAt,
    }));
  const output = {
    source,
    filePath,
    windowStart,
    windowEndExclusive,
    scanMode: "current-open-boundary-diff",
    revisionCount: revisions.length,
    candidateCount: currentCandidates.length,
    candidates: currentCandidates,
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    source,
    revisionCount: output.revisionCount,
    candidateCount: output.candidateCount,
    outputPath,
  }, null, 2));
  process.exit(0);
}

const candidates = new Map();
for (const revision of revisions) {
  let text;
  let priorText = "";
  try {
    text = execFileSync(
      "git",
      ["-C", repositoryPath, "show", `${revision.commit}:${filePath}`],
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );
    const parent = execFileSync(
      "git",
      ["-C", repositoryPath, "rev-parse", `${revision.commit}^`],
      { encoding: "utf8" },
    ).trim();
    try {
      priorText = execFileSync(
        "git",
        ["-C", repositoryPath, "show", `${parent}:${filePath}`],
        { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
      );
    } catch {
      priorText = "";
    }
  } catch {
    continue;
  }
  const rows = parseRows(text);
  const priorRows = parseRows(priorText);
  const priorUrls = new Set(priorRows.map((row) => row.url));
  for (const row of rows.filter((candidate) => !priorUrls.has(candidate.url))) {
    const existing = candidates.get(row.url);
    const observedAt = revision.committedAt;
    if (!existing) {
      candidates.set(row.url, {
        ...row,
        source,
        firstAddedAt: observedAt,
        lastAddedAt: observedAt,
      });
      continue;
    }
    if (observedAt < existing.firstAddedAt) existing.firstAddedAt = observedAt;
    if (observedAt > existing.lastAddedAt) {
      Object.assign(existing, row, { lastAddedAt: observedAt });
    }
  }
}

const output = {
  source,
  filePath,
  windowStart,
  windowEndExclusive,
  revisionCount: revisions.length,
  candidateCount: candidates.size,
  candidates: [...candidates.values()].sort((left, right) =>
    left.firstAddedAt.localeCompare(right.firstAddedAt) || left.url.localeCompare(right.url),
  ),
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  source,
  revisionCount: output.revisionCount,
  candidateCount: output.candidateCount,
  outputPath,
}, null, 2));
