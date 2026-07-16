# ApplyCue Setup

## Agent-led

Give the agent the repository URL and say: `Install ApplyCue, read its agent instructions, run doctor, and start with my CV.`

## Manual stable install

The canonical user install is a Git clone checked out at a named stable tag from
the [GitHub Releases page](https://github.com/eyeinthesky6/applycue/releases).
Replace `<stable-tag>` with a tag such as `ApplyCue-v0.1.0`:

```powershell
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
git checkout --detach <stable-tag>
corepack pnpm install --frozen-lockfile
node doctor.mjs --json
```

If `pnpm` is already available, use `pnpm install`. Do not run `corepack enable`
on Windows just for ApplyCue; it can require administrator access to the Node.js
installation directory.

The install downloads Node.js dependencies into the clone and a
Playwright-managed Chromium build into Playwright's per-user browser cache. It
does not install Docker, Go, Python, or an embedded AI model/runtime.

Then start Codex/Claude in the repository and say: `Set up ApplyCue and start with my CV.`

For headless Codex, run:

```powershell
codex exec "Read AGENTS.md and skills/applycue/SKILL.md, run doctor, and begin ApplyCue setup."
```

Plain-language prompts are the supported interface; slash commands are optional and may not be available in every agent host.

Node.js 22.5+ is required for the optional SQLite tracker index. Docker, Go, Python, and AI API keys are not required for the default MVP.

Candidate files are local and gitignored. See `DATA_CONTRACT.md`.

## Channels, updates, and rollback

- A named `ApplyCue-v*` tag is the stable channel. It stays on one source commit.
- `main` is the rolling development channel. Use it for contribution or explicit
  evaluation of unreleased changes, not as a stable-version promise.
- A GitHub-generated source ZIP has no `.git` history. It cannot use the Git
  update, version-verification, or rollback commands below. Replace the whole ZIP
  extraction with another named release instead of mixing files between versions.

To update a stable Git install, first preserve the user's local files and check
the release notes for migration instructions. Then fetch and switch deliberately:

```powershell
git status --short
git fetch origin --tags
git checkout --detach <new-stable-tag>
corepack pnpm install --frozen-lockfile
node doctor.mjs --json
npm run check
```

Do not switch versions over unexplained tracked changes. Candidate data is
normally gitignored, but keep a separate backup before any update.

If a release is bad, stop using it and return to the last known-good tag without
rewriting history:

```powershell
git checkout --detach <previous-known-good-tag>
corepack pnpm install --frozen-lockfile
node doctor.mjs --json
npm run check
```

Report the bad tag, exact commit, first failing command, and whether user-layer
data changed. Maintainers keep the bad release record visible, document the safe
replacement, and publish a new patch tag after verification; they do not move or
reuse the bad tag. The separate `npm run rollback` command rolls back the most
recent in-product system-layer update. It is not a replacement for checking out
a known-good release tag after a bad repository release.
