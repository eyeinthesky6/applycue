# FAQ

Status: current short answers; detailed rules remain in their owner documents.

## Is ApplyCue a job board?

No. ApplyCue is an agent-led CV-to-offer workflow. It helps the agent discover jobs, filter obvious misses, generate truthful CV variants, prepare applications, and track outcomes.

## Does the user need to edit files?

No for normal use. The user should chat with the agent. The agent can update profile files, source approvals, and apply policy.

## Where does user data live?

Prefer the external profile store:

```text
~/.applycue/profiles/<profile>/
```

Repo-local config remains a development fallback, but real CVs and generated outputs belong only in the external profile store and must not be committed.

## Can it apply automatically?

Yes, only inside the user's configured policy. It must pause on unclear answers, sensitive fields, unsupported claims, ask-before portals, blocked or scammy portals, payment requests, or anything that changes a public profile.

## Should scores be shown to users?

Usually no. Scores are backend prioritization signals. The user needs plain decisions: apply, review, watch, or skip.
