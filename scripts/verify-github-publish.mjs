import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const remote = process.env.GIT_VERIFY_REMOTE || "origin";
const branch = process.env.GIT_VERIFY_BRANCH || git(["branch", "--show-current"]);

if (!branch) {
  throw new Error("Cannot verify a detached HEAD; check out the configured source branch first.");
}

const localSha = git(["rev-parse", "HEAD"]);
const ref = `refs/heads/${branch}`;
const remoteLine = git(["ls-remote", "--heads", remote, ref]);
const remoteSha = remoteLine.split(/\s+/u)[0] || "";

if (!remoteSha) {
  throw new Error(`Remote ${remote} does not expose ${ref}; publication is unverified.`);
}

if (remoteSha !== localSha) {
  throw new Error(
    `GitHub publication mismatch: local ${localSha}, ${remote}/${branch} ${remoteSha}.`,
  );
}

console.log(`GitHub publication verified: ${remote}/${branch} = ${localSha}`);
