import { readFile, writeFile } from "node:fs/promises";

const jobsUrl = new URL("../data/jobs.json", import.meta.url);
const jobs = JSON.parse(await readFile(jobsUrl, "utf8"));

const aliases = new Map([
  ["AI Products", "AI/ML"],
  ["AI product", "AI/ML"],
  ["Backend", "SWE/Data Infra"],
  ["Backend/Data Infra", "SWE/Data Infra"],
  ["Data", "SWE/Data Infra"],
  ["Frontend/Full Stack", "SWE/Data Infra"],
  ["General SWE", "SWE/Data Infra"],
  ["Quant Developer", "Quant"],
  ["Quant Research", "Quant"],
  ["Research", "AI/ML"],
]);

const removeDirections = new Map([
  ["bytedance-research-scientist-recommendation-2027", new Set(["Quant"])],
  ["sciemo-data-scientist-63626f61", new Set(["Quant"])],
]);

for (const job of jobs) {
  const removed = removeDirections.get(job.id) ?? new Set();
  job.directions = [
    ...new Set(
      job.directions
        .map((direction) => aliases.get(direction) ?? direction)
        .filter((direction) => !removed.has(direction)),
    ),
  ];
  if (job.id === "sciemo-data-scientist-63626f61") {
    job.resumeTrack = "Data / AI-ML";
  }
  if (job.id === "bytedance-research-scientist-recommendation-2027") {
    job.resumeTrack = "AI-ML";
  }
}

await writeFile(jobsUrl, `${JSON.stringify(jobs, null, 2)}\n`);
