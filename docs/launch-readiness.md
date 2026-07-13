# ApplyCue Launch Readiness

## Claim levels

### Code healthy

Required:

```powershell
node validate-system-paths-coverage.mjs
node test-all.mjs
```

Also require clean `git diff --check`, no tracked candidate data, and successful dashboard/DOCX/application-receipt tests.

### Locally usable

In a clean user layer:

1. `pnpm install` succeeds with no Go/Python/Docker requirement.
2. `node doctor.mjs --json` clearly enters onboarding.
3. A supplied PDF or DOCX CV is preserved and extracted without material loss.
4. The agent asks for optional source access and confirms the enriched story.
5. A configured scan produces visible stage counts or an honest source blocker.
6. Viable previews are hydrated into full JDs.
7. The agent produces a sensible shortlist and explains obvious false positives/eliminations.
8. One role produces matching Markdown/HTML/PDF/DOCX artifacts.
9. `npm run dashboard` shows the same role and working links.

### Ready for public MVP

All local gates plus:

1. The public `main` URL contains this consolidated runtime and README.
2. A new agent can clone and start from the suggested prompt without repository-specific coaching.
3. One controlled real or approved test application gets named approval, a preflight, an attempt receipt, and a reliable outcome.
4. Confirmed success updates the tracker/dashboard; uncertain success remains `unknown` and blocks retry.
5. Install/update/rollback and license attribution are verified.
6. No stale docs advertise deleted `pnpm applycue:*`, TypeScript worker, second profile store, or Go TUI workflows.

## UAT evidence to retain locally

- doctor JSON;
- scan and filter counts;
- reviewed JD URLs and decisions;
- generated artifact paths and open/parse checks;
- application receipt outcome/evidence;
- tracker query and dashboard screenshot/snapshot;
- exact blocker when a gate fails.

Do not commit the candidate's evidence.

## Current boundary

The merged code can be called code-healthy only after the final suite passes. Public-MVP-ready requires the clean-link install and one end-to-end application UAT; tests alone cannot make that claim.
