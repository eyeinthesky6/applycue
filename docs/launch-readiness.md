# ApplyCue Launch Readiness

## Claim levels

### Code healthy

Required:

```powershell
node validate-system-paths-coverage.mjs
node test-all.mjs
```

Also require clean `git diff --check`, no tracked candidate data, and successful dashboard/action-receipt/DOCX/application-receipt tests.

For every current final decision still awaiting application, require `node review-evidence.mjs check --job=N` to report `state=current`. A changed JD, preference, candidate evidence file, report, or review field must return the role to pending re-review and block application start. For every role claiming a prepared CV, also require `node cv-bundle.mjs check --job=N --cv=<selected.pdf-or-docx>` to report `state=current` and identify the selected artifact. Already confirmed historical applications retain their lifecycle outcome even when present-day preferences later change.

### Locally usable

In a clean user layer:

1. `pnpm install` succeeds with no Go/Python/Docker requirement.
2. `node doctor.mjs --json` clearly enters onboarding.
3. A supplied PDF or DOCX CV is preserved and extracted without material loss.
4. The agent asks for optional source access and confirms the enriched story.
5. A configured scan produces visible stage counts or an honest source blocker.
6. Viable previews are hydrated into full JDs.
7. A useful multi-source batch exercises the pipeline (target 100+ normalized leads unless the configured market/sources honestly cannot supply them), and the agent produces a ranked top five or explains why fewer genuinely fit.
8. The user judges the ranked shortlist, at least four of the first five are relevant or the agent records/corrects the miss, and the agent audits a sample of objective rejects and semantic skips for false elimination.
9. At least one non-trivial role receives an employer success brief, a primary role-family lens, targeted recovery questions for material missing work, and a concise positioning/change summary.
10. That role produces matching Markdown/HTML/PDF/DOCX artifacts, records their hashes against the current JD/decision, and verifies the exact PDF or DOCX selected for upload.
11. `npm run dashboard` shows the same role and working links.
12. A dashboard CV-change note blocks the old bundle; after regeneration and agent resolution the new bundle can proceed. Dashboard apply approval is accepted only for its exact CV and preflight.

### Ready for public MVP

All local gates plus:

1. The public `main` URL contains this consolidated runtime and README.
2. A new agent can clone and start from the suggested prompt without repository-specific coaching.
3. The batch/shortlist/false-elimination evidence above is retained. A manually supplied job URL plus one filled form is not sufficient proof of the product promise.
4. One controlled real or approved test application gets a current `ready` code-backed live-form preflight, named approval, an attempt receipt bound to that preflight, and a reliable outcome.
5. Confirmed success updates the exact tracker row and derived dashboard state through the finish command; uncertain success remains `unknown`, is visible on that job, and blocks retry.
6. Install/update/rollback and license attribution are verified.
7. No stale docs advertise deleted `pnpm applycue:*`, TypeScript worker, second profile store, or Go TUI workflows.

### Public main promotion

The old public `main` and this consolidated runtime do not share product history. Do not merge them with `--allow-unrelated-histories` and do not rename the product branch in a way that leaves GitHub's default branch stale.

After all public-MVP gates pass:

1. Create and push a dated archive branch at the old `origin/main` commit.
2. With explicit maintainer approval, update `main` to the exact tested release commit using `--force-with-lease`.
3. Verify the public README and clean-clone journey from `main`.
4. Enable required checks/branch protection, then tag that exact commit.

Until those steps are complete, `codex/applycue-merged-mvp` is the release candidate and public `main` is not the product source of truth.

## UAT evidence to retain locally

- doctor JSON;
- scan and filter counts;
- ranked top-five user feedback plus sampled false-positive/false-elimination review;
- reviewed JD URLs and decisions;
- employer success brief, role-family lens, sourced/inferred/unknown separation, and material evidence-recovery questions;
- confirmed recovered evidence location plus the CV positioning/change summary;
- durable full-JD capture paths and fresh review-receipt state;
- generated artifact paths, CV-bundle fingerprint, file hashes, and selected-upload check;
- approved-answer fingerprint plus the no-fill live-form preflight receipt and evidence reference;
- dashboard action id, any CV-change resolution/new-bundle binding, and the exact approval source;
- application receipt outcome/evidence and matching tracker transition;
- tracker query and dashboard screenshot/snapshot;
- exact blocker when a gate fails.

Do not commit the candidate's evidence.

## Current boundary

The merged code can be called code-healthy only after the final suite passes. Public-MVP-ready requires the clean-link install, useful batch and shortlist proof, false-elimination review, role-aware CV proof, and one end-to-end application UAT. Tests or one manually supplied application alone cannot make that claim.
