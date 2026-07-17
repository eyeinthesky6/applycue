# Getting Help

ApplyCue is early and local-first. The fastest support path is to keep the issue rooted in a reproducible command, file, or UAT artifact.

## Where To Ask

| Need | Where |
|---|---|
| Setup, usage, or troubleshooting question | [GitHub Discussions: Q&A](https://github.com/eyeinthesky6/applycue/discussions/categories/q-a) after checking `README.md`, `docs/SETUP.md`, and `node doctor.mjs --json` |
| Sanitized workflow, integration, or outcome | [GitHub Discussions: Show and Tell](https://github.com/eyeinthesky6/applycue/discussions/categories/show-and-tell) |
| Release or maintainer update | [GitHub Discussions: Announcements](https://github.com/eyeinthesky6/applycue/discussions/categories/announcements) |
| Reproducible bug | [GitHub Issues](https://github.com/eyeinthesky6/applycue/issues/new/choose) |
| Scoped feature work | [GitHub feature-request form](https://github.com/eyeinthesky6/applycue/issues/new/choose) |
| Contribution | Read `CONTRIBUTING.md`; open an issue before broad work |
| Security vulnerability | Follow the private route in `SECURITY.md` |

## Before Posting

1. Search existing Discussions and Issues.
2. Run `node doctor.mjs --json`.
3. Run `npm run check` for a product code change.
4. For help or a bug, include your OS, Node.js version, agent CLI, command run,
   and the first blocker string.

Do not include CVs, names, personal contact details, credentials, application
history, browser receipts, scan output, or generated candidate files in any
public Discussion, Issue, or pull request. Use fictional or sanitized evidence.

Support is currently best effort. ApplyCue 0.1 supports named `ApplyCue-v*`
release tags on Node.js 22.5 or newer. The `main` branch is a moving development
channel, not a stable release. GitHub source ZIPs can be inspected, but they do
not contain the Git history needed for the documented update and rollback flow.
Older untagged branches and donor worktrees are not supported user install paths.

When reporting an install or update problem, include `git rev-parse HEAD` and
`git describe --tags --exact-match` output when available. If the second command
fails, say whether you intentionally installed rolling `main` or used a ZIP.
