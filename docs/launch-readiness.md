# ApplyCue Launch Readiness

## Claim levels

### Code healthy

Required:

```powershell
node validate-system-paths-coverage.mjs
node test-all.mjs
```

Also require clean `git diff --check`, no tracked candidate data, and successful dashboard/action-receipt/DOCX/application-receipt tests.

Before publishing any branch, run `gitleaks git --redact --verbose`. Contributors can install the pinned local hook with `pre-commit install`; GitHub runs the same pinned MIT Gitleaks CLI against reachable history in `.github/workflows/secret-scan.yml`. Local hooks can be skipped, so public promotion also requires the CI job to pass on the exact commit.

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
11. When that role is marked high stakes, `node high-stakes-pack.mjs check --job=N` reports `current` and binds the campaign pack to the same review/CV, or the UAT records an explicit urgent-use exception.
12. `npm run dashboard` shows the same role, campaign freshness where applicable, and working links.
13. A dashboard CV-change note blocks the old bundle; after regeneration and agent resolution the new bundle can proceed. Dashboard apply approval is accepted only for its exact CV and preflight.

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

Promotion completed on 2026-07-16. The previous public `main` is preserved at `archive/pre-merged-main-20260716`, and public `main` now owns the consolidated runtime. The promotion used an exact-SHA `--force-with-lease`; it did not join unrelated histories.

The promoted source commit was `02827dc0ec6a08db2bfe34a55c0998685bf33b33`. A clean public clone passed all 900 tests, and the main-push Tests, Secret scan, CodeQL, and dependency checks passed. Public-MVP readiness still requires the product UAT evidence listed above; source promotion alone does not satisfy those product-outcome gates.

### First public release baseline

ApplyCue's first public release is `0.1.0`. There is no earlier ApplyCue GitHub Release or matching tag. Release Please therefore uses an empty manifest, `initial-version: 0.1.0`, and bootstrap commit `2d27caf870416604576a67ed9434f2c8460486fa`, immediately before the consolidated ApplyCue runtime. This keeps inherited Career-Ops history out of ApplyCue's generated first-release changelog.

`CHANGELOG.md` is generated release metadata and belongs to the system layer. After the first release PR is merged, the bootstrap setting is ignored by Release Please and may be removed in the next normal maintenance change. Do not merge a generated release PR if it reintroduces inherited product names, unrelated issue links, or pre-consolidation claims.

### Release integrity and recovery

`release.yml` is the only automatic release path. Merging a reviewed Release
Please PR is the publication action and requires explicit maintainer approval;
ordinary pushes do not create a release. Release Please creates the GitHub
release as a draft and creates its exact tag immediately. The workflow then
calls `sbom.yml` once with that tag, checks out and verifies the tag's source
commit, attaches and downloads the evidence while the release is still a draft,
and publishes only after that reusable job succeeds. The publish job refuses a
non-draft release, a changed release id, tag or source commit, or an asset set
other than the two verified files below.

`sbom.yml` also supports an explicit manual backfill for an existing
`ApplyCue-v*` release, but does not subscribe independently to
release-published events and never publishes a draft. Backfill reuses the
existing SBOM, verifies any existing receipt, uploads only a missing asset, and
downloads the final assets to compare their bytes. It never overwrites
inconsistent release evidence.

Release runs are serialized and are not cancelled by a newer push. A failure
before publication leaves the same draft and tag available for the original
workflow's failed jobs to retry. Manual backfill with `require_draft` can repair
or verify missing evidence but cannot publish it. If the publish API call may
have succeeded before final readback failed, inspect the provider state first;
the job deliberately refuses to republish a non-draft release. Do not delete,
recreate or retag a partial release to make the workflow green.

The release carries `ApplyCue-sbom.spdx.json` plus
`ApplyCue-release-evidence.txt`. The receipt identifies the repository, release
tag, source commit and source URL and records the SBOM SHA-256. The checksum
receipt supports integrity checking; it is not a cryptographic attestation and
does not by itself prevent asset replacement.

GitHub release immutability and artifact attestations are not enabled or claimed
by the checked-in workflow. The draft-attach-verify-publish sequence is ready
for future immutable releases, but immutability is true only after the provider
setting is separately enabled and a published release is read back as
immutable. GitHub applies that setting only to future releases, so the
historical `ApplyCue-v0.1.0` tag and release remain unchanged. Never move that
tag or replace its assets; issue a verified patch release when a correction is
needed.

The supported user install is a Git clone at a named `ApplyCue-v*` tag. `main` is
a moving development channel, and a generated source ZIP lacks the Git history
needed for the documented update and rollback flow. Release readiness requires a
clean install and checks from the exact proposed tag, plus a tested return to the
previous known-good tag. For a bad release, retain the record, name the safe
replacement, and issue a verified patch tag; never move or reuse the published
tag. See `docs/SETUP.md` for the user commands.

## UAT evidence to retain locally

- doctor JSON;
- scan and filter counts;
- ranked top-five user feedback plus sampled false-positive/false-elimination review;
- reviewed JD URLs and decisions;
- employer success brief, role-family lens, sourced/inferred/unknown separation, and material evidence-recovery questions;
- confirmed recovered evidence location plus the CV positioning/change summary;
- durable full-JD capture paths and fresh review-receipt state;
- generated artifact paths, CV-bundle fingerprint, file hashes, and selected-upload check;
- high-stakes campaign-pack receipt/fingerprint and dashboard link when the tested role is high stakes;
- approved-answer fingerprint plus the no-fill live-form preflight receipt and evidence reference;
- dashboard action id, any CV-change resolution/new-bundle binding, and the exact approval source;
- application receipt outcome/evidence and matching tracker transition;
- tracker query and dashboard screenshot/snapshot;
- exact blocker when a gate fails.

Do not commit the candidate's evidence.

## Current boundary

The merged code can be called code-healthy only after the final suite passes. Public-MVP-ready requires the clean-link install, useful batch and shortlist proof, false-elimination review, role-aware CV proof, and one end-to-end application UAT. Tests or one manually supplied application alone cannot make that claim.

Status on 2026-07-17: the private controlled-application chain has passed through a current full JD, agent decision, verified CV, live-form preflight, named approval, confirmed attempt outcome, exact tracker transition, and dashboard state. The remaining product-proof gap is the fresh-user journey: clean installation, faithful CV intake, useful multi-source discovery, shortlist quality, sampled false-elimination review, and first-batch preparation. Personal receipts stay outside Git.

## Community governance decision

Status: accepted by the repository owner on 2026-07-17.

ApplyCue needs a low-friction place for ordinary job seekers who should not need
GitHub knowledge to ask a question or share product feedback. The owner therefore
selected a paired Telegram surface: `https://t.me/applycue` is the official
announcement/release/guide channel, and its linked discussion group is the
ordinary-user help, feedback, ideas, and community space. The group is currently
reached through the public channel while its own stable public username is not
yet configured.

GitHub is the engineering surface. Discussions are for contributor design
questions, extensions, integrations, and reusable technical examples. Reproducible
bugs and scoped feature work remain in Issues; contributions follow
`CONTRIBUTING.md`; vulnerabilities use the private route in `SECURITY.md`.

All public surfaces are best effort with no response-time promise. Telegram and
GitHub posts must not contain candidate data, credentials, application history,
employer correspondence, browser receipts, or generated candidate files. Feedback
about one candidate's CV, roles, answers, or preferences remains in the private
agent chat or local dashboard. Review the community surfaces after 30 days, or
sooner if the maintainer cannot moderate them or repeated privacy violations make
them unsafe.
