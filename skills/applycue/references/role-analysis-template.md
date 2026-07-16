# Adaptive Role Analysis Template

Use this reference to create a new job-specific report under `reports/`. Never edit this template for an individual job. Copy its useful structure into the new report, then adapt the output to the role, available evidence, decision, risk, urgency, and user input.

## Contents

- Required report contract
- Agent freedom
- Output scaffold
- Before recording the receipt

## Required report contract

Every completed review must retain:

- company, role, date, live URL or pasted-JD note, archetype/role family, decision, queue rank when applicable, confidence, legitimacy, and CV/PDF state;
- a plain-language reading of the employer's need and likely outcomes;
- evidence-backed strengths, material gaps, unknowns, and likely hiring doubts;
- the confirmed user preferences that affected the decision;
- a clear `apply`, `watch`, or `skip` reason;
- separation of sourced facts, agent inference, and unresolved user facts;
- a `## Review receipt` section compatible with `review-evidence.mjs`;
- sources whenever external research informed the report.

Do not replace this contract with a numeric fit score or keyword-overlap decision.

## Agent freedom

The headings below are a scaffold, not a form. The agent may rename, reorder, combine, expand, or omit optional sections; use prose, bullets, or tables; and add role-specific sections when they make the decision or application better. Do not emit empty placeholders or irrelevant boilerplate.

- **Standard role:** keep the report brief but decision-complete.
- **High-stakes role:** deepen company/team context, public success-pattern research when lawful and useful, positioning, evidence recovery, selection risks, and CV/application strategy.
- **Apply:** include a concrete CV plan and unresolved application answers. Add interview or narrative material when it improves the application.
- **Watch or skip:** preserve the decision evidence, but do not generate a CV, cover letter, or form answers unless the user asks.
- **Missing candidate evidence:** ask only targeted questions that could materially change the decision or CV. Record confirmed additions in the approved user evidence layer before using them.

## Output scaffold

```markdown
# Evaluation: {Company} - {Role}

**Date:** {YYYY-MM-DD}
**URL:** {live URL | pasted JD, no URL}
**Archetype / role family:** {primary; optional secondary}
**Decision:** {apply | watch | skip}
**Rank:** {positive integer in current apply queue | -}
**Confidence:** {high | medium | low}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious | Unverified text-only JD}
**CV / PDF:** {verified path | pending | not required}

## Employer success brief

- **Explicit need:** {what the employer directly says}
- **Likely outcomes:** {agent inference, labelled as such}
- **People to influence:** {teams, users, partners, executives, regulators}
- **First-page signals:** {three messages the CV must communicate}
- **Hiring doubts:** {likely concerns and the evidence or question that addresses each}
- **Context boundary:** {what is sourced, inferred, or still unknown}

## Role summary

{Concise role, level, location, term, scope, and one-sentence reading. Use a table only when it improves scanning.}

## Evidence match and gaps

| Employer need | Approved candidate evidence | Assessment / gap |
| --- | --- | --- |
| {need} | {specific evidence and source} | {strong, adjacent, gap, or unknown} |

## Decision and positioning strategy

{Why apply/watch/skip; role level and trade-offs; three promises to lead with; honest bridge language; evidence worth recovering.}

## CV strategy

{For apply decisions: what to lead with, reorder, shorten, add from approved evidence, or remove. State unresolved material facts. Do not write the same CV formula for every role family.}

## Targeted questions for the user

{Include only questions whose answers could materially improve the decision, CV, form, or application. Omit when none are needed.}

## Compensation, term, and practical trade-offs

{Optional. Include only reliable sourced information and relevant user constraints. Say when data is unavailable.}

## Selection / interview preparation

{Optional. Map the most useful evidence stories, case study, likely objections, and preparation points. Adjust depth to stakes and decision.}

## Posting legitimacy

{Liveness, freshness, role identity, description quality, hiring context, reposting, and caveats. Use observations, not accusations.}

## Review receipt

- **Strengths:** {evidence-backed list}
- **Gaps:** {material list}
- **Unknowns:** {items that could change the decision or application}
- **Preference basis:** {confirmed preferences used}
- **Reason:** {plain-language decision reason}

## Draft application answers

{Apply only. Use confirmed facts; flag unresolved legal, compensation, travel, notice-period, or role-specific answers.}

## Cover or application narrative

{Optional starting draft when useful. Keep unconfirmed claims and required user angles visibly unresolved.}

## Keywords and employer language

{Optional diagnostic list for human/ATS recognition. It never decides fit.}

## Sources

- [{Source name}]({URL})
```

## Before recording the receipt

Remove unused optional headings, confirm that every strong claim maps to approved evidence, ensure inferences are labelled, reconcile the tracker decision/rank/confidence, and then record and check the fingerprint-bound review receipt.
