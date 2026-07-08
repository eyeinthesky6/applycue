@AGENTS.md
<!-- Claude config: canonical ApplyCue agent rules live in AGENTS.md. -->

Use `node doctor.mjs --json` for onboarding state. Read the `"missing": [...]`
and `"warnings": [...]` arrays from that output instead of duplicating setup
checks here.

User-specific custom rules live in `modes/_custom.md`. If it is absent during
onboarding, seed it from `modes/_custom.template.md`.
