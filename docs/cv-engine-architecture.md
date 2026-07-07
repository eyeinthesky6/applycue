# CV Engine Architecture

Date: 2026-07-06

## Goal

The CV engine creates truthful job-specific CVs without letting the agent hand-edit CV files or source code for one application.

The agent operates the engine. The engine owns generation.

## V1 Format

V1 has one CV format:

```text
standard_ats_v1
```

The user's uploaded CV is used as a fact source. It is not used as the layout source.

Additional CV formats can come later, likely as a paid product feature. They must be template-only changes, not changes to proof logic or job-specific code.

## Engine Inputs

Every job-specific CV is generated from:

- standard/base CV facts
- user preferences
- approved target base CV, if one exists
- proof bank
- job description requirements
- reusable user-approved answers
- one-off user-approved answers

## Engine Outputs

The engine produces:

- requirement map
- CV content plan
- reconciliation report
- rendered CV in `standard_ats_v1`
- upload-ready DOCX artifact
- application answer draft
- blocked or needs-confirmation reasons

## Flow

```text
base CV
  -> fact extraction
  -> user-approved fact ledger
  -> optional target base CV
  -> JD requirement extraction
  -> requirement-to-proof map
  -> CV content plan
  -> reconciliation
  -> standard template renderer
  -> output CV
```

## Fact Ledger

Facts are the source of truth.

Examples:

```text
Fact: Built Python backend services.
Category: skill
Source: base_cv
Sensitivity: minor

Fact: Led product roadmap for payments platform.
Category: role
Source: user_confirmed
Sensitivity: major
```

Minor supported facts can be reworded.

Major facts need explicit user approval.

## Target Base CV

A target base CV is a reusable approved repositioning layer.

Example:

```text
original engineer CV -> approved product manager base CV -> job-specific PM CV
```

This prevents the engine from trying to reinvent an engineer-to-product-manager transformation for every job.

Major repositioning claims go into the target base CV only after user approval.

## Base CV Versions

A base CV is a versioned source document, not a generated job-specific output.

The user can have multiple base CVs, such as product, sales, and business development. Each base CV has a role family, version, status, and path.

For v1, a run uses:

```text
profile.activeBaseCvId -> active base CV -> target base CV if applicable -> job-specific CV
```

If the user or agent updates a base CV, ApplyCue creates a new version and keeps the old one for traceability. See `docs/base-cv-versioning.md`.

## Reconciliation Rules

The engine must block or pause when:

- a generated claim has no source fact
- a major claim lacks user approval
- a job requirement is written as experience when it is unsupported
- contact, city, role, company, date, education, work authorization, or compensation differs from approved facts
- application form answers conflict with the generated CV

Allowed without user approval:

- clearer wording
- re-ordering
- supported keyword emphasis
- supported tool/language phrasing
- adjacent positioning clearly grounded in existing proof

## Agent Boundary

Agent can:

- call the CV engine
- ask the user to approve major changes
- save output files
- review reconciliation reports

Agent cannot:

- directly edit CV files for one application
- directly edit templates during an application run
- make code changes for one job
- insert unapproved facts

Application runs should write to the active output root. For real user runs:

```text
~/.applycue/profiles/<profile>/data/local/
~/.applycue/profiles/<profile>/outputs/cvs/
~/.applycue/profiles/<profile>/outputs/dashboard/
```

Application runs should not write to:

```text
packages/
apps/
skills/
docs/
```

## UAT Checks

UAT should include:

- original CV to generated CV claim trace
- job description requirement map
- no unsupported facts in rendered CV
- no unapproved major changes
- engineer-to-product-manager flow requires approved PM target base CV
- application answers match CV facts
- generated CV uses only `standard_ats_v1`
- rendered CV completeness: identity, configured contact fields, summary, skills, experience, enough content, employer structure, no near-duplicate bullets, awards, and education when those facts exist
- no source-code edits during an application run

## OSS Tooling Candidates

These can help the plumbing, but they do not replace ApplyCue's truth engine:

- JSON Resume: useful structured resume schema inspiration.
- Ajv: validate fact ledger, CV plan, and rendered metadata against JSON Schema.
- Mammoth.js: import `.docx` CVs into clean HTML for fact extraction.
- remark/unified: parse and inspect Markdown output as an AST.
- Handlebars: render the one standard template from structured data.
- docx: generate Word `.docx` files from structured content.
- Pandoc: convert Markdown/HTML to `.docx` or PDF if we prefer a CLI renderer.

Recommended v1 approach:

```text
structured JSON plan -> Markdown -> reconciliation -> HTML preview + DOCX upload export
```

Add libraries only when the implementation reaches that layer. Do not add dependencies just because they are useful later.

## Current Renderer Baseline

Status: upgraded on 2026-07-06.

The `standard_ats_v1` renderer should preserve enough of the user's base career structure to look like a real CV:

- name and contact
- summary
- core skills from supported job requirements
- company-level experience from structured work history
- matched proof bullets under the matching employer when possible
- selected impact for matched proof that does not map cleanly to one employer
- awards and education extracted from the base CV text when present

This is still one standard format. It is not a new design template.

The renderer must not invent dates, employers, education, awards, or metrics. If those items are not present in structured profile fields, proof bank, facts, or base CV text, it should omit them or leave the section simpler.

Current artifacts:

- Markdown: audit/debug source.
- HTML: local preview and print-friendly review.
- DOCX: browser application upload file.

Browser apply plans should upload DOCX when it exists. They should not upload Markdown.

UAT now checks the rendered Markdown directly before handoff. A run should fail if generated CVs become thin extracts, drop configured contact fields, lose named employer structure, repeat near-duplicate bullets, omit awards or education from the base CV, contain empty employer headings, or leave employer sections with too little substance.
