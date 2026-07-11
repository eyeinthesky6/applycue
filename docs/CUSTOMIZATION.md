# ApplyCue Customization Guide

Status: current navigation guide

Normal users customize ApplyCue through chat. The agent updates approved profile/config data and regenerates artifacts; users should not edit source code, prompt modes, templates, or generated outputs for one application.

## Current Customization Owners

| Need | Owner |
| --- | --- |
| Identity, target roles, locations, work mode, compensation, source policy, and apply policy | `~/.applycue/profiles/<profile>/applycue.json` through setup/config flows |
| Base CVs and supporting files | `~/.applycue/profiles/<profile>/assets/` |
| Approved candidate facts and proof | Profile facts and proof bank described in [`data-contracts.md`](data-contracts.md) |
| Reusable application answers | `pnpm applycue:approve-answers` through the agent |
| Approved job sources | Source-plan and `pnpm applycue:approve-sources` flows |
| Reusable shortlist feedback | `record-tuning` followed by user-approved `apply-tuning` |
| CV wording/layout policy | [`cv-tailoring-policy.md`](cv-tailoring-policy.md) and one `standard_ats_v1` renderer |

Detailed configuration fields and examples live in [`configuration.md`](configuration.md). Setup questions live in [`setup-questionnaire.md`](setup-questionnaire.md). The agent runs commands; normal users stay in chat.

## Do Not Customize Here

- Do not put user-specific facts in `AGENTS.md`, skills, root modes, source code, or templates.
- Do not hand-edit generated CVs, source plans, browser plans, routes, dashboards, or receipts.
- Do not edit `.env` or add provider credentials without explicit user permission.
- Do not restore removed career-ops files as an ApplyCue profile, customization layer, or fallback.
