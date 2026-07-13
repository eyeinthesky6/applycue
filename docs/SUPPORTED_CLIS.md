# Supported CLIs

ApplyCue is designed for agent CLIs that can read repo instructions and run local commands.

| CLI | Entrypoint | Notes |
|---|---|---|
| Codex | `AGENTS.md`, `CODEX.md` | Use plain-language prompts when slash commands are unavailable. |
| Claude Code | `CLAUDE.md` | Imports `AGENTS.md`. |
| OpenCode | `OPENCODE.md` | Imports `AGENTS.md`. |
| Antigravity CLI | `AGENTS.md` | Use for free-tier local agent runs where available. |
| Qwen Code | `AGENTS.md` | Supported through shared instructions. |
| Grok Build CLI | `AGENTS.md` | Supported through shared instructions. |
| Kimi CLI | `AGENTS.md` | Supported through a thin skill bridge. |

The user-facing interface is chat. Commands are for the agent.
