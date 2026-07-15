# Getting Help

ApplyCue is early and local-first. The fastest support path is to keep the issue rooted in a reproducible command, file, or UAT artifact.

## Where To Ask

| Question type | Where |
|---|---|
| Bug | GitHub Issues for this repository |
| Feature idea | GitHub feature-request template |
| Setup help | Start with `README.md`, `docs/SETUP.md`, then run `node doctor.mjs --json` |
| Security vulnerability | See `SECURITY.md` |

## Before Opening An Issue

1. Search existing issues.
2. Run `node doctor.mjs --json`.
3. Run `npm run check` for a product code change.
4. Include your OS, Node.js version, agent CLI, command run, and the first blocker string.

Do not include private CVs, personal contact details, credentials, or generated application artifacts in public issues.

Support is currently best effort. ApplyCue 0.1 supports the current `main`
release on Node.js 22.5 or newer; older branches and donor worktrees are not
supported user install paths.
