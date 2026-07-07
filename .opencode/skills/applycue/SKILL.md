---
name: applycue
description: Run ApplyCue CV-to-offer automation from chat: setup, discovery, CV tailoring, applications, answers, outcomes, and UAT.
arguments: request
user_invocable: true
user-invocable: true
argument-hint: "[setup | status | batch | apply | answers | sources | outcomes | dashboard | uat | help] or a natural-language ApplyCue request"
---

# ApplyCue Skill Bridge

This is a compatibility bridge for OpenCode-style skill discovery.

Before acting, read the canonical ApplyCue skill completely:

```text
../../../skills/applycue/SKILL.md
```

Then follow that file as the source of truth.

Do not add business logic here. The canonical skill owns routing, safety rules, setup flow, browser preflight, CV truth policy, answer approval, source approval, outcome tracking, and response shape.

If the canonical file cannot be read, stop and say the ApplyCue skill installation is incomplete.
