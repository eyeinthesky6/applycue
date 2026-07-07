# Base CV Versioning

Date: 2026-07-06

## Decision

ApplyCue treats a base CV as a versioned source document.

The user may have more than one base CV:

- product
- sales
- business development
- consulting
- founder/operator

Only one base CV is active for a single run, but many base CVs can live in config.

Real base CV files live in the user asset store, not the source repo:

```text
~/.applycue/profiles/default/assets/base-cvs/
```

## Why This Matters

A job-specific CV should not start from the wrong career story.

Example:

```text
Product role -> product base CV -> job-specific product CV
Sales role -> sales base CV -> job-specific sales CV
BD role -> BD base CV -> job-specific BD CV
```

The agent should not turn a product CV into a sales CV for every job from scratch. If the user wants that repositioning, the agent creates or imports a reusable sales base CV first.

## Config Shape

Base CVs live in `baseCvs`.

The active one is selected by:

```json
{
  "profile": {
    "activeBaseCvId": "jai-product-vp-2026-07-06"
  }
}
```

Each base CV has:

- `id`
- `label`
- `kind`
- `status`
- `version`
- `path`
- `roleFamilyTerms`
- `originalPath`
- `parentBaseCvId`
- `createdAt`
- `updatedAt`
- `notes`

## Status

Use simple states:

- `active`: can be used for job-specific CV generation
- `draft`: created by the user or agent, not yet approved
- `needs_review`: imported or generated but needs user review
- `archived`: old version kept for traceability

## Updates

Never overwrite a base CV silently.

When the user updates a base CV:

1. Keep the old file.
2. Add a new file with a date/version in the name.
3. Add a new `baseCvs` entry.
4. Set the new entry to `draft` or `needs_review`.
5. After user approval, mark it `active`.
6. Archive the old active version for that role family.

## Agent-Created Base CVs

The agent may propose a new base CV when the user asks for a real role-family shift.

Example:

```text
source: product base CV
new target: sales leadership base CV
```

The proposed base CV must stay `draft` or `needs_review` until the user approves the major claims.

Approved repositioning facts are recorded in the fact ledger and reused later.

## Role Selection

For v1, selection can be simple:

1. If the user sets `activeBaseCvId`, use it.
2. Else use the first `active` base CV.
3. Else fall back to `profile.baseCvPath`.

Later, the agent can choose the best base CV by matching:

- job title
- job description
- `roleFamilyTerms`
- user objectives
- target role terms

If the match is unclear, pause and ask the user.

## Non-Negotiables

- A job-specific CV is generated output, not a new base CV.
- A base CV update creates a new version, not an in-place edit.
- A role-family shift needs approval before becoming reusable.
- Application runs must not edit source code or templates.
- The active base CV, target base CV, proof items, and facts must all be traceable.
