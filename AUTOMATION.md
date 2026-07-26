# Job Radar Update Contract

- Source: `NEW_GRAD_USA.md` from `speedyapply/2027-SWE-College-Jobs`.
- Scope: US full-time roles with repository `age <= 30d`.
- Update `data/jobs.json` for recommended or technically strong roles. Required fields: `id`, `canonicalUrl`, `company`, `role`, `location`, `ageDays`, `source`, `firstSeenAt`, `lastCheckedAt`, `eligibility`, `startTiming`, `sponsorship`, `fitTier`, `fitScore`, `directions`, `resumeTrack`, `reasons`, `caveats`, `applyUrl`, `status`.
- Update `data/source-state.json` on every scan. Preserve `firstSeenAt`; set scan timestamps and append every scanned normalized URL to `seenCanonicalUrls`.
- Dedupe key: official job ID when present; otherwise normalized canonical URL with tracking parameters, fragments, and trailing locale variants removed.
- Never infer 2027 timing or sponsorship from silence. Use `timing-check` and `unknown` until an official job page or application form provides evidence.
- Keep private profile data out of both JSON files.
- Build with `npm run build`.
- Any future deployment must preserve `.openai/hosting.json` and use its existing Sites project ID; never create a second Sites project.
