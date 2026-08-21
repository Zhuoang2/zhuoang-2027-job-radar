import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [source, repositoryPath, filePath, outputPath] = process.argv.slice(2);
if (!outputPath || !["speedyapply", "vanshb03"].includes(source)) {
  throw new Error(
    "Usage: node scripts/audit-github-history.mjs <speedyapply|vanshb03> <repository> <file> <output-json>",
  );
}

const windowStart = "2026-06-21T00:00:00-07:00";
const windowEndExclusive = "2026-08-21T00:00:00-07:00";

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
  const rows = source === "speedyapply" ? parseSpeedy(text) : parseVanshb(text);
  const priorRows = source === "speedyapply" ? parseSpeedy(priorText) : parseVanshb(priorText);
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
