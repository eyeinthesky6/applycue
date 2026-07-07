# User Asset Storage

Date: 2026-07-06

## Decision

User assets do not live in the source repo.

The repo contains:

- code
- contracts
- templates
- docs
- example config
- example input files

Real user data lives outside the repo.

Default local path:

```text
~/.applycue/profiles/default/
```

On this Windows machine, that resolves to:

```text
%USERPROFILE%\.applycue\profiles\default\
```

## Local Store Shape

```text
~/.applycue/
  profiles/
    default/
      applycue.json
      assets/
        base-cvs/
        images/
        jobs/
        certificates/
        portfolios/
      outputs/
        cvs/
        dashboard/
        reconciliation/
        runs/
      data/
        local/
```

`applycue.json` stores metadata and pointers. The files live under `assets/`.

## What Counts As An Asset

Assets include:

- base CVs
- role-specific user-generated base CVs
- profile images
- portfolio files
- certificates
- cover-letter sources
- application attachments
- local job import files

## Retrieval Rules

ApplyCue resolves config in this order:

1. explicit `configPath` passed by the caller
2. `APPLYCUE_CONFIG`
3. `APPLYCUE_HOME/profiles/<profile>/applycue.json`
4. repo-local `config/applycue.local.json` as a legacy development fallback
5. sample fixture if no config is found

Default profile key is:

```text
default
```

The user or agent can select another profile later through `APPLYCUE_PROFILE` or an app setting.

## Why Not Store Assets In The Repo

User assets are private and change independently of code.

Putting them in the repo creates problems:

- accidental commits
- hardcoded personal paths
- poor multi-user support
- no clear backup or sync boundary
- difficult SaaS migration later

The engine should read assets through config and storage pointers, not by assuming files inside `C:\Projects\applycue`.

## Future SaaS Shape

The same model can map to hosted storage later:

```text
UserAsset.path -> local file path in v1
UserAsset.path -> object-storage key in SaaS
```

Examples:

```text
assets/base-cvs/product-v3.docx
users/<userId>/assets/base-cvs/product-v3.docx
s3://applycue-user-assets/<userId>/base-cvs/product-v3.docx
```

The important thing is that source code never needs to know the user's actual CV filename or profile image location.

## Non-Negotiables

- Do not hardcode user CVs or profile images in source files.
- Do not commit real user config.
- Do not commit real user assets.
- Keep example files small and fake.
- Store only metadata and pointers in config.
- Keep generated application outputs separate from source assets.
- For real user runs, write generated outputs under the user profile store, not under the repo.
