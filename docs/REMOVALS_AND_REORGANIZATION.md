# 2026-07-13 Removal and Reorganization Record

## Goal

Make the merged product understandable and runnable: one ApplyCue runtime, one source of truth, one dashboard, and one agent/app/user loop.

## Removed from the launch branch

| Removed | Reason | Replacement / preservation |
| --- | --- | --- |
| `apps/` TypeScript workers/browser/web app | second orchestrator and placeholder UI | root modes/scripts; independent branch preserved |
| `packages/` TypeScript core/profile/discovery/ranker/CV/engine/tracker | duplicated nearly every product owner | useful ideas ported behind root owners; donor branch preserved |
| TypeScript workspace/config/test runner | existed only for removed control plane | root Node test suite |
| Go `dashboard/` TUI and Go build requirement | second UI and terminal-only user experience | `dashboard-server.mjs` browser dashboard |
| `role-matcher.mjs` fuzzy title dedupe | could erase different teams/cities/countries | exact record/source identity only; agent reviews ambiguity |
| typed command documentation and second user-store workflow | sent agents into a deleted runtime | canonical root skill and local user layer |
| unreferenced legacy GIF/JPG product media | added repository weight and represented stale product shapes | new visuals can be added after the current browser flow is stable |
| Docker wrapper/image | stale Go-dashboard dependency and unnecessary default install complexity | native Node install; container support can return only after a measured deployment need |
| Nix flake, direnv hook, and Bun dev shell | undocumented second dependency installer that could drift from pnpm | the same native Node/pnpm install on every platform |
| embedded Gemini/OpenAI/Ollama/OpenRouter evaluator scripts | created a second AI path although MVP uses the user's native agent | future model trials are documented in `ai-judgment-trial-plan.md` |

## Retained from the mature fork

- providers/scanner and liveness checks;
- full-JD agent modes and reports;
- PDF/LaTeX/cover-letter paths;
- pipeline, merge, tracker, SQLite index, advisory cooldown signals, follow-up and outcome helpers;
- application form workflow and explicit submit permission;
- updater, plugins, localization, and regression suite.

## Re-homed from ApplyCue donor work

- browser dashboard with progress cards, filters, original-JD/CV links, stage-aware user actions, and local CV-change notes;
- DOCX renderer;
- application-attempt state and unknown-submit protection;
- agent-first CV plus approved portfolio/public-profile discovery;
- baseline-before-rewrite and visible stage counts;
- separate semantic decision, lifecycle status, and imported-history provenance so old `Evaluated` rows cannot inflate the current shortlist;
- claim-source confirmation as a signal rather than a hard moral gate;
- external-agent ownership of fuzzy fit and CV writing.

## Data reorganization

The canonical runtime uses one local user layer:

```text
cv.md
config/profile.yml
modes/_profile.md
portals.yml
data/applications.md
data/scan-history.tsv
data/application-attempts.jsonl
data/job-feedback.jsonl
reports/
output/
```

The separate `%USERPROFILE%\.applycue\profiles\...` typed store is not part of this branch. Multi-profile external storage remains V1 work.

## Git and attribution

The independent donor/control-plane history is publicly reachable through shared Git history and archived/donor branches. It is retained as unsupported reference and recovery evidence, not merged wholesale or offered as a runtime. The public launch branch keeps ApplyCue naming and MIT attribution for its Career-Ops-derived foundation. Deleting or hiding a branch would not erase shared Git history; branch/tag cleanup is a release operation, not a runtime requirement.

## Rollback

Every removed component remains recoverable from Git history and, where retained, donor branches/worktrees. That recovery evidence does not make the historical code supported. Restoration must be feature-specific and attach to an existing root owner; restoring the complete second control plane is explicitly rejected.

The authoritative retain/port/replace/defer/reject matrix and its acceptance gates are in [`2026-07-14_applycue-career-ops-integration_architectural_review.md`](2026-07-14_applycue-career-ops-integration_architectural_review.md).
