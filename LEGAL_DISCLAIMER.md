# Legal Disclaimer And Acceptable Use

Status: project disclaimer, not legal advice. Review with qualified counsel before a formal commercial or regulated launch.

## 1. Current Product Shape

ApplyCue is currently distributed as local source code plus an agent skill. The supported engine is TypeScript under `apps/` and `packages/`; inherited Markdown modes and root scripts have been removed from this branch, with historical evidence retained only in dated docs and Git history.

The canonical runtime does not require ApplyCue to host a model or require a model API key. The user chooses an external agent product such as Codex or Claude. That agent provider may process the CV, job description, and chat content under its own terms and privacy settings.

## 2. Personal Data

Current ApplyCue profiles, CVs, generated documents, receipts, and outcomes should remain in the user's external local store under `~/.applycue/profiles/<profile>/`. They must not be committed to the source repository or included in public support reports.

Using an external agent, browser account, email connector, hosted model, job portal, or cloud service may transmit personal data to that provider. Users and operators must review the exact provider, account, retention, region, and permission settings before sending real data.

This document does not make a universal GDPR controller/processor determination. That role depends on the actual deployment, data flow, organisation, and purpose.

## 3. AI And Generated Content

External agents and any future model provider can make mistakes or invent information. ApplyCue includes typed facts, proof mapping, CV reconciliation, hard gates, and review paths, but those controls do not guarantee that every output is correct.

Users and operators must verify generated CVs, answers, messages, and application decisions. Unsupported candidate claims must not be submitted. Correct problems through approved profile facts, proof, answers, or tuning and regenerate; do not hand-edit a generated application artifact to bypass the truth path.

The first run is review-first. Browser submission is allowed only when the generated plan, current preflight, saved user policy, and explicit live command all permit it. Email and DM routes are draft-only in ApplyCue and final send requires explicit user confirmation in the connected tool or browser.

## 4. Third-Party Platforms

ApplyCue can interact with public job sources and user-approved career portals. Users and operators must comply with each platform's terms and applicable law.

Do not use ApplyCue to:

- bypass access controls, CAPTCHA, or platform restrictions;
- scrape a source that prohibits the intended access;
- spam employers or submit misleading applications;
- overwhelm an ATS or job board;
- collect or disclose personal data without a valid purpose and permission.

Platform restrictions, account actions, and external-service availability remain outside ApplyCue's control.

## 5. Acceptable Use

Acceptable use includes:

- discovering and reviewing roles from approved sources;
- generating truthful CVs and application materials from approved facts;
- preparing or submitting applications within saved policy and current preflight evidence;
- tracking replies, interviews, offers, rejections, and user feedback;
- drafting messages that the user explicitly confirms before sending.

Unacceptable use includes:

- inventing qualifications, employment, education, metrics, identity, or outcomes;
- submitting outside the user's policy, current preflight, or required confirmation;
- using fees, private identity documents, or suspicious registration flows without review;
- discriminating unlawfully, deceiving employers, or impersonating another person;
- exposing credentials, CVs, application answers, or receipts in the source repository.

## 6. EU AI Act And Other Regulation

Do not assume that local execution, an MIT licence, or open-source distribution creates a blanket EU AI Act exemption. Applicability depends on facts such as whether a party is a provider, deployer, importer, distributor, or product manufacturer; where the system and its outputs are used; and whether an exception actually applies.

ApplyCue does not currently train or place a general-purpose AI model on the market. A future hosted service, embedded model, substantial model modification, commercial deployment, or organisational hiring use would require a fresh legal assessment.

Primary references:

- [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [European Commission guidance for general-purpose AI providers](https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers)

## 7. Costs And External Accounts

Users are responsible for charges from agent products, model APIs, browser services, job platforms, cloud tools, or other external providers they choose. ApplyCue should not enable paid services or edit credentials without explicit user approval.

## 8. Warranty And Liability

ApplyCue is provided under the MIT licence. See [`LICENSE`](LICENSE) for the governing warranty and liability terms.

No result is guaranteed. Generated artifacts and passing UAT prove workflow behaviour, not interviews, offers, employment, legal compliance, or platform acceptance.

## 9. Project Name

The source code is MIT licensed. No separate trademark policy is currently published in this repository. Do not claim endorsement, affiliation, or official status that does not exist.

## 10. Changes

This disclaimer may change as the distribution, model boundary, connectors, and legal context evolve.
