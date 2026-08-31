import { execFileSync } from "node:child_process";

const [source, repositoryPath, filePath, baselineCommit, currentCommit = "HEAD"] = process.argv.slice(2);
if (!baselineCommit || !["speedyapply", "vanshb03", "simplifyjobs"].includes(source)) {
  throw new Error("Usage: node scripts/compare-source-snapshots.mjs <source> <repository> <file> <baseline-commit> [current-commit]");
}

function text(value) {
  return value.replace(/<br\s*\/?\s*>/gi, "; ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function url(value) {
  const parsed = new URL(value.replace(/&amp;/g, "&"));
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || ["embed", "ref", "source", "spread"].includes(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  parsed.hash = "";
  return parsed.toString().replace(/\?$/, "").replace(/\/$/, "");
}

function speedy(input) {
  let company = "";
  return input.split("\n").flatMap((line) => {
    if (!/^\|/.test(line)) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) return [];
    const value = text(cells[0]);
    if (value && value !== "↳") company = value;
    const link = [...cells[4].matchAll(/href="([^"]+)"/g)][0]?.[1];
    return link ? [{ company: value === "↳" ? company : value, role: text(cells[1]), location: text(cells[2]), url: url(link) }] : [];
  });
}

function vansh(input) {
  return input.split("\n").filter((line) => /^\|\s*\*\*/.test(line)).flatMap((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const link = [...(cells[3] ?? "").matchAll(/href="([^"]+)"/g)][0]?.[1];
    return link ? [{ company: text(cells[0]).replace(/^\*\*|\*\*$/g, ""), role: text(cells[1]), location: text(cells[2]), url: url(link) }] : [];
  });
}

function simplify(input) {
  let company = "";
  return [...input.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((match) => {
    const cells = [...match[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((item) => item[1]);
    if (cells.length !== 5) return [];
    const link = [...cells[3].matchAll(/href="([^"]+)"/g)].map((item) => item[1]).find((item) => !item.includes("simplify.jobs/p/"));
    if (!link) return [];
    const value = text(cells[0]).replace(/^🔥\s*/, "");
    if (value && value !== "↳") company = value;
    return [{ company: value === "↳" ? company : value, role: text(cells[1]), location: text(cells[2]), url: url(link) }];
  });
}

function snapshot(commit) {
  const input = execFileSync("git", ["-C", repositoryPath, "show", `${commit}:${filePath}`], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const rows = source === "speedyapply" ? speedy(input) : source === "vanshb03" ? vansh(input) : simplify(input);
  return new Map(rows.map((row) => [row.url, row]));
}

const before = snapshot(baselineCommit);
const after = snapshot(currentCommit);
const added = [...after].filter(([key]) => !before.has(key)).map(([, row]) => row);
const removed = [...before].filter(([key]) => !after.has(key)).map(([, row]) => row);
const changed = [...after].flatMap(([key, row]) => {
  const prior = before.get(key);
  return prior && JSON.stringify(prior) !== JSON.stringify(row) ? [{ before: prior, after: row }] : [];
});

console.log(JSON.stringify({ source, baselineCommit, currentCommit: execFileSync("git", ["-C", repositoryPath, "rev-parse", currentCommit], { encoding: "utf8" }).trim(), baselineEntryCount: before.size, currentEntryCount: after.size, added, removed, changed }, null, 2));
