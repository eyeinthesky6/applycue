# CV Tailoring Policy

Date: 2026-07-06

## Decision

Every role-specific CV and application answer must be generated from three inputs:

1. the user's base CV and existing profile facts
2. the user's preferences and constraints
3. the job description requirements

The agent may re-order, emphasize, shorten, translate, and map wording. It may not invent facts.

## Truth Rule

Every claim in a generated CV or application answer must trace to at least one source:

- base CV text
- structured work history
- proof bank item
- user-confirmed reusable answer
- user-confirmed one-off answer

If a job requirement has no support, ApplyCue should mark it as unsupported and either omit it or pause for user confirmation.

Current engine rule:

- `supported`: direct approved proof/fact exists. The requirement may shape the generated CV.
- `needs_confirmation`: adjacent evidence exists, but the requirement is not directly proven. The candidate pauses before CV/application output can proceed.
- `unsupported`: no approved proof/fact exists. The requirement must not be claimed.

Required adjacent requirements are not treated as "good enough" by default. They are useful signals for asking the user, not permission to write a stronger CV.

It should never turn:

```text
worked near AI teams
```

into:

```text
led enterprise AI transformation
```

unless the proof bank or user-confirmed facts support that exact claim.

## Requirement Mapping

Before writing the CV, ApplyCue should map job requirements like this:

```text
Requirement: SaaS GTM strategy
Status: supported
Proof: Led SaaS positioning and growth work at X
Action: emphasize in summary and experience

Requirement: healthcare compliance
Status: unsupported
Proof: none
Action: do not claim it; optionally mention adjacent regulated-industry work if true
```

This mapping is more important than the final prose. It is the safety layer.

Reconciliation reports include coverage counts:

```text
total required
supported
needs confirmation
adjacent
unsupported
```

Use these counts to audit false positives and false negatives. A high `needs confirmation` count means the JD is close to the profile but not yet proven. A high `unsupported` count means the job should not get a tailored CV unless the user adds truthful approved facts.

## Format Strategy

V1 uses one format only:

```text
standard_ats_v1
```

That means:

- the uploaded CV is a fact source, not a layout source
- every generated CV uses the same simple ATS-friendly ApplyCue format
- additional formats are parked for later or paid product tiers
- no agent should edit templates or code for one job application

Why:

- it is safer
- it reduces code complexity
- it avoids making design the product
- it makes reconciliation and UAT easier
- it prevents per-application code churn

## V1 Standard Format

The v1 format should be simple:

```text
Name and contact
Headline
Summary
Core skills
Experience
Selected proof or projects
Education
Links
```

## Should Format Vary Across Candidates?

In v1: no.

All users use the same standard format. Content changes by candidate and job; layout does not.

Reason:

- recruiters do not care that every ApplyCue user has the same design
- users care about results, not decorative design
- changing one user's format every job creates noise
- content fit matters more than visual variety

## Should We Offer Design Options?

Not in v1 core.

Later options:

- executive
- technical
- consulting
- academic/research
- early-career
- portfolio-heavy

The agent can create new templates later, but templates must be data-driven and versioned. A template change cannot change facts.

## Code Impact

CV design should not require changing shortlisting, proof mapping, application logic, or browser automation.

Keep this split:

```text
profile facts -> proof map -> CV content plan -> reconciliation -> standard template renderer -> output file
```

If a later paid product allows CV redesign, only the template renderer changes.

The proof map and content plan stay the same.

This means:

- templates are files/config, not product logic
- a new template should not change facts
- a template cannot add unsupported claims
- tests can check the same content plan across multiple templates

## Agent Boundary

The agent should never directly edit a CV file for a job application.

Allowed:

- call the CV engine
- pass base CV, user preferences, target base CV, and job description to the engine
- review the reconciliation report
- ask the user to approve major changes
- save generated outputs under the active output root, for example `~/.applycue/profiles/<profile>/outputs/cvs/`

Not allowed:

- hand-edit a generated CV
- change code for a single job application
- patch templates during an application run
- insert unapproved facts to make a job look like a better fit

Normal application runs should write only data and output files, not source code.

## Target Base CVs

Some career moves need a new approved base CV.

Example:

```text
Current base CV: software engineer
Target role: product manager
```

The engine should not transform every engineer CV into a product manager CV from scratch for each job. That will fail reconciliation and create messy output.

Instead:

1. Agent proposes a new target base CV for product manager roles.
2. Every major repositioning claim is shown to the user.
3. User approves, edits, or rejects each major claim.
4. Approved facts are recorded.
5. Future product-manager job-specific CVs derive from that approved target base CV.

This creates a reusable bridge:

```text
original engineer CV -> user-approved PM base CV -> job-specific PM CV
```

Base CV updates are versioned. The agent or user should create a new dated base CV entry, review the changes, then mark it active after approval. Old base CV versions stay available for traceability and rollback.

## Major And Minor Changes

Minor changes can be generated without approval when supported:

- wording changes
- section ordering
- keyword emphasis
- equivalent tool names already present in proof
- clearer phrasing of an existing responsibility

Major changes require explicit user approval and should be recorded for reuse:

- role or title change
- city or location change
- industry/domain claim
- years of experience
- management ownership
- revenue, cost, growth, or performance metrics
- certifications
- education
- work authorization
- compensation
- claiming a different function, such as engineer to product manager

The agent may use careful positioning for adjacent experience, but it must label it as adjacent. It cannot write work the applicant has not done or approved.

## Reconciliation

Every generated CV must produce a reconciliation report before rendering.

The report checks:

- each CV claim maps to a source fact, proof item, or user-approved target-base fact
- each job requirement is supported, adjacent, unsupported, or needs confirmation
- every major change has user approval
- unsupported requirements are not presented as experience
- contact, location, company, education, dates, and titles match approved facts
- application answers use the same fact ledger as the CV

If reconciliation fails, the engine returns:

```text
blocked
```

If it needs the user:

```text
needs_user_confirmation
```

Only passed CVs should be rendered for submission.

## Application Forms

Application form answers use the same truth rule.

Safe auto-fill:

- name
- email
- phone
- location
- links
- notice period if configured
- compensation floor if configured
- work authorization if configured

Pause:

- unsupported skill claim
- exact years of experience if unclear
- salary expectation if missing
- relocation or visa questions if unset
- disability/medical/demographic questions
- anything requiring sensitive personal data

## V1 Implementation Direction

Use `CvVariant` to store:

- `formatMode`
- `templateId`
- `sourceCvHash`
- `targetBaseCvId`
- requirement matches
- unsupported requirements
- reconciliation status
- reconciliation notes
- proof-backed changes

The generated file should be reproducible from:

```text
base CV + profile + proof bank + job description + template
```

That is how ApplyCue avoids fabrication while still creating role-specific CVs at volume.
