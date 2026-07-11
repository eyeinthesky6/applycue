# Supported CLIs

Status: current instruction/bridge inventory, not a guarantee of identical vendor features.

ApplyCue is designed for agent CLIs that can read repo instructions and run local commands.

| CLI | Entrypoint | Notes |
|---|---|---|
| Codex | `AGENTS.md`, `CODEX.md` | Use plain-language prompts when slash commands are unavailable. |
| Claude Code | `CLAUDE.md` | Imports `AGENTS.md`. |
| OpenCode | `OPENCODE.md` | Imports `AGENTS.md`. |
| Antigravity CLI | `.antigravitycli/skills/applycue/SKILL.md` | Thin bridge to the canonical skill. |
| Qwen Code | `.qwen/skills/applycue/SKILL.md` | Thin bridge to the canonical skill. |
| Grok Build CLI | `.grok/skills/applycue/SKILL.md` | Thin bridge to the canonical skill. |
| Kimi CLI | `.kimi/skills/applycue/SKILL.md` | Thin bridge to the canonical skill. |

The user-facing interface is chat. Commands are for the agent.
