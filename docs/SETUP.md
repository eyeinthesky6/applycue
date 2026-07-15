# ApplyCue Setup

## Agent-led

Give the agent the repository URL and say: `Install ApplyCue, read its agent instructions, run doctor, and start with my CV.`

## Manual

```powershell
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
corepack pnpm install
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
