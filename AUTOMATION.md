# Job Radar Update Contract

## Sources and scope

- Scan these sources every day, in this order:
  1. **Primary:** `NEW_GRAD_USA.md` from `speedyapply/2027-SWE-College-Jobs`.
  2. **Supplemental:** `vanshb03/New-Grad-2027` on its current default branch. It contains substantial 2025/2026 history; consider only a new or changed role with explicit 2027 graduation or start-cycle evidence.
  3. **Monitor:** `SimplifyJobs/New-Grad-Positions` and the `SimplifyJobs` organization. Check both whether the existing repository has explicitly switched to 2027 and whether a new repository explicitly targeting 2027, New Grad, or College Jobs exists. Do not add 2026 positions merely because Simplify has updated.
- Scope: United States, full-time, SWE, AI/ML, ML Systems, Data, Backend, Infra, Quant Developer, or Quant Research roles with source age `<= 60d`. Include roles with explicit 2027 timing as eligible; an otherwise open and directionally suitable early-career or new-grad role without official 2027 timing may be shown as `timing-check` / pending. Never infer its start date or treat it as confirmed.
- `data/source-state.json` is the shared scan baseline. Preserve the legacy SpeedyApply fields used by the site and update `sourceMonitoring` for all three sources on every run: each source's URL, cycle/monitoring state, last-check time, candidate-only baseline, and source mentions. Keep uncertain cross-source matches in `suspectedDuplicates`; do not create a duplicate job card.
- Update `data/jobs.json` for recommended or technically strong roles. Required fields: `id`, `canonicalUrl`, `company`, `role`, `location`, `ageDays`, `source`, `firstSeenAt`, `lastCheckedAt`, `eligibility`, `startTiming`, `sponsorship`, `fitTier`, `fitScore`, `directions`, `resumeTrack`, `reasons`, `caveats`, `applyUrl`, `status`.
- Update `data/source-state.json` on every scan. Preserve `firstSeenAt`; set scan timestamps and append every scanned normalized URL to the appropriate source baseline. Remove a listed job only after it is closed, fails a hard eligibility rule, or leaves the 60-day source window.
- Dedupe across all sources and the unified application record in this order: official job ID; normalized official application URL (remove tracking parameters, fragments, and trailing locale variants); company + role + location; then company + similar title + highly similar responsibilities. Update a matching existing record when a link changes or reopens; only unresolved matches go to `suspectedDuplicates` for main-thread review.
- Open every candidate's official job page to verify responsibilities, cohort/start timing, location, open status, and sponsorship language. Never infer 2027 timing or sponsorship from silence: use `timing-check` and `unknown` until official evidence exists. Do not include a closed role, a role limited to U.S. citizens, a role that declines future sponsorship, or a role with stated experience or degree timing incompatible with the user's graduation plan.
- Keep private profile data out of both JSON files.
- Derive `data/applications.json` from the unified application record. Keep only `id`, `company`, optional `role`, and one simple status: `applying`, `needs-review`, `submitted`, or `paused`. Do not copy answers, dates, resume versions, notes, or sensitive fields into the site.
- Omit `skipped` or untouched jobs from `data/applications.json`. Map `started`, `analyzing`, and `filling` to `applying`; map `needs-review` and `ready-to-submit` to `needs-review`; preserve `submitted`; map `blocked` to `paused`.
- Before testing, call the Codex workspace dependency loader. This project requires Node 22.13 or newer; if the default shell is older, prepend the loader's bundled Node directory to `PATH`.
- Run both `npm test` and `npm run lint` with the supported Node runtime. The current bundled runtime is under `/Users/madivhkassel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`.
- Any future deployment must preserve `.openai/hosting.json` and use its existing Sites project ID; never create a second Sites project.
- For each deployment, obtain a fresh short-lived Sites source-repository credential, use it only for that push, and never persist its token in files or Git configuration.
- Push the exact tested commit, package that commit's build, save a Sites version, and use owner-only private deployment.
