# Getting Help

ApplyCue is early and local-first. The fastest support path is to keep the issue rooted in a reproducible command, file, or UAT artifact.

## Where To Ask

| Question type | Where |
|---|---|
| Bug | GitHub Issues for this repository |
| Feature idea | GitHub Issues or product planning docs |
| Setup help | Start with `README.md`, `docs/SETUP.md`, then let the agent run `pnpm applycue:status` |
| Security vulnerability | See `SECURITY.md` |

## Before Opening An Issue

1. Search existing issues.
2. Run `pnpm applycue:status` and capture the first blocker.
3. If it touches ApplyCue packages, run `pnpm applycue:check`.
4. Include your OS, Node.js version, agent CLI, command run, and the first blocker string.

Do not include private CVs, personal contact details, credentials, or generated application artifacts in public issues.
