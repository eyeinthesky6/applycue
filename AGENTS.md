# ApplyCue Agent Rules

Use simple language in user-facing explanations.

Before changing code, read `docs/agent-development-guide.md`. For storage or CV work, also read `docs/user-asset-storage.md`, `docs/base-cv-versioning.md`, `docs/cv-tailoring-policy.md`, and `docs/cv-engine-architecture.md`.

ApplyCue is an independent CV-to-offer agent. Do not import another job-search repo as the engine, do not expose another project's skill as ApplyCue, and do not copy another project's brand or product shape.

Core rules:

- Keep product behavior rooted in ApplyCue-owned contracts and code.
- Keep source code separate from user data. Real user assets, configs, local jobs, and generated outputs live under `~/.applycue/profiles/<profile>/`, not inside this repo.
- Do not invent CV claims, employers, credentials, dates, metrics, or contact details.
- Do not hand-edit generated CVs for one application. Fix the engine, renderer, facts, proof bank, or config instead.
- Do not patch source code for one application run.
- Do not commit real user config, CVs, profile images, local jobs, or generated CV outputs.
- Do not apply, send messages, or change public profiles outside the user's configured apply settings.
- Do not edit env files or secrets without explicit user permission.
- Do not use shared developer API keys for user discovery or application runs. If a provider needs a login or API key, each user must connect or create their own credential.
- Prefer shared types in `packages/core` before adding new data shapes.
- Keep deterministic gates and ranking logic explainable.
- Scores are backend signals for prioritization, not user-facing judgment.
- Browser automation may apply autonomously when a role and form match the user's configured policy. Pause on exceptions, sensitive fields, unsupported claims, or unclear answers.
- Ask only blocking setup questions upfront. Keep role-specific or source-specific unknowns as pending questions.
- Treat unknown portals carefully. Pause on payment requests, registration fees, unclear company identity, or strange document requests.
