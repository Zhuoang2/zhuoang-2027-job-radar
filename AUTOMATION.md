# Job Radar Update Contract

- Source: `NEW_GRAD_USA.md` from `speedyapply/2027-SWE-College-Jobs`.
- Scope: US full-time roles with repository `age <= 30d`.
- Update `data/jobs.json` for recommended or technically strong roles. Required fields: `id`, `canonicalUrl`, `company`, `role`, `location`, `ageDays`, `source`, `firstSeenAt`, `lastCheckedAt`, `eligibility`, `startTiming`, `sponsorship`, `fitTier`, `fitScore`, `directions`, `resumeTrack`, `reasons`, `caveats`, `applyUrl`, `status`.
- Update `data/source-state.json` on every scan. Preserve `firstSeenAt`; set scan timestamps and append every scanned normalized URL to `seenCanonicalUrls`.
- Dedupe key: official job ID when present; otherwise normalized canonical URL with tracking parameters, fragments, and trailing locale variants removed.
- Never infer 2027 timing or sponsorship from silence. Use `timing-check` and `unknown` until an official job page or application form provides evidence.
- Keep private profile data out of both JSON files.
- Derive `data/applications.json` from the unified application record. Keep only `id`, `company`, optional `role`, and one simple status: `applying`, `needs-review`, `submitted`, or `paused`. Do not copy answers, dates, resume versions, notes, or sensitive fields into the site.
- Omit `skipped` or untouched jobs from `data/applications.json`. Map `started`, `analyzing`, and `filling` to `applying`; map `needs-review` and `ready-to-submit` to `needs-review`; preserve `submitted`; map `blocked` to `paused`.
- Before testing, call the Codex workspace dependency loader. This project requires Node 22.13 or newer; if the default shell is older, prepend the loader's bundled Node directory to `PATH`.
- Run both `npm test` and `npm run lint` with the supported Node runtime. The current bundled runtime is under `/Users/madivhkassel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`.
- Any future deployment must preserve `.openai/hosting.json` and use its existing Sites project ID; never create a second Sites project.
- For each deployment, obtain a fresh short-lived Sites source-repository credential, use it only for that push, and never persist its token in files or Git configuration.
- Push the exact tested commit, package that commit's build, save a Sites version, and use owner-only private deployment.
