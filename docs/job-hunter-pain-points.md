# Job Hunter Pain Points And ApplyCue Coverage

Date: 2026-07-06

Status: historical research input, not a current capability matrix. Some names and
coverage notes below describe pre-consolidation designs. For current behavior use
[`PRODUCT_DECISION.md`](PRODUCT_DECISION.md),
[`product-roadmap.md`](product-roadmap.md), and the canonical
[`ApplyCue skill`](../skills/applycue/SKILL.md). Do not use this document as
evidence that a mode, connector, application volume, interview outcome, or hiring
result is available in the launch runtime.

## Summary

ApplyCue should not treat all job hunters as the same user.

The product is strongest when it behaves like a CV-to-offer agent with different operating modes:

- low-volume market check
- active search
- urgent interview generation
- career change
- senior/executive search
- return-to-work search
- location-constrained search
- visa/work-authorization constrained search

The core pain across almost every category is the same:

```text
too many weak opportunities -> too much manual effort -> too little feedback -> no learning loop
```

ApplyCue covers the automation, tailoring, batch, and tracking side well. The biggest gaps are network intelligence, accessibility/accommodation settings, early-career proof building, and confidence/mental-load support.

V1 should not chase every long-tail category. After the 2026-07-06 product review, the main priority is:

```text
CV-to-offer loop + local progress dashboard.
```

Network intelligence, accessibility, executive-only, and early-career proof-builder depth can follow once the main loop is working.

## Coverage Status

Status meanings:

- `covered`: already represented in docs, config, or contracts.
- `partial`: partly represented, but needs stronger product behavior.
- `gap`: not meaningfully covered yet.

## Pain Point Matrix

| Job hunter type | Main pain points | ApplyCue coverage | Status | Product notes |
| --- | --- | --- | --- | --- |
| Urgent unemployed or laid-off user | Needs interviews quickly, high application volume, low patience for manual review, ghosting, emotional fatigue, cash pressure | `push` mode, `applicationsPerDay`, batch apply, match widening, email tracking, outcome learning | partial | Need a "get interviews this week" preset, weekly volume targets, and response-rate dashboard. |
| Employed passive user | Wants to test market quietly, avoid current employer, avoid time waste, protect confidentiality | current company field, current employer gate, low daily count, `review` or low-volume `daily`, compensation/location filters | partial | Need stealth mode: no current employer, no public profile edits, no daytime calls unless allowed. |
| Active but not desperate user | Wants steady applications, quality over noise, less manual work, clear daily summary | `daily` mode, batch plan, relax plan, source scanning, CV tailoring | covered | This is the default ApplyCue user. |
| Career changer | Hard to translate old experience to new role, lacks exact keywords, uncertain adjacent titles, needs proof mapping | proof bank, adjacent role terms, adjacent industries, CV tailoring, match range | partial | Need explicit career-change narrative builder and transferable-proof review. |
| New grad or early-career user | Little proof, unclear target titles, high competition, many assessments, low signal from CV | target roles, proof bank, CV tailoring, batch apply | partial | Need project/education proof builder, internship/new-grad source pack, assessment tracking. |
| Senior/executive user | Fewer public roles, role titles vary, networking matters, confidential search, overqualified risk | seniority, company stage, company targets, CV tailoring, source discovery | partial | Later: network intelligence, executive narrative, board/advisor/fractional support, confidential mode. |
| Older worker / 50+ | Age bias, long search duration, overqualification, concern around dates and seniority framing | CV tailoring can reduce irrelevant detail, seniority controls, target level | partial | Need age-bias-aware CV formatting, date strategy, seniority framing, confidence around title fit. |
| Returner / caregiver / career break | Gap stigma, confidence gap, flexible schedule needs, proof may be old or non-linear | proof bank, CV tailoring, work-mode/location settings | partial | Need career-break narrative, recent-proof generation, flexible-work preset. |
| Location-constrained user | Needs specific city/country/remote region, relocation concerns, timezone mismatch | preferred/extra/ask-before locations, searchSettings, standardHoursOnly, shift settings, relax plan | covered | Good coverage. Need UI that always shows final search area. |
| Visa or work-authorization constrained user | Sponsorship filters are noisy, forms ask late, country rules vary | workAuthorizationCountries, visaSponsorshipRequired, pending questions | partial | Good incremental asking model. Need country-specific pause rules and sponsorship source detection. |
| Disabled or neurodivergent user | Accessibility, accommodations, disclosure timing, remote/flexible needs, interview format | remote/work-mode preference, pending questions, pause on sensitive data | gap | Need accommodation preferences, disclosure policy, accessible interview preference, ADA-style answer drafts. |
| Parent/caregiver needing flexibility | Schedule, school pickup, remote/hybrid, travel limits, non-standard shift issues | standardHoursOnly, preferred/ask-before shifts, maxTravelPercent, remote/hybrid/location settings | partial | Need "flex-first" preset and pause rules for travel/shift/onsite ambiguity. |
| Contractor/fractional/consultant | Multiple engagement types, shorter cycles, portfolio/proposal fit, different compensation model | employmentTypes includes contract/consulting/fractional, proof bank, CV tailoring | partial | Need proposal generator, rate card, availability windows, multiple CV formats. |
| Platform-heavy applicant | Repeated forms, portal logins, scam portals, duplicate profiles, job-board noise | sourceSettings, trusted/ask-before/blocked portals, fraud signals, browser agent | partial | Need portal trust checks, portal credentials policy, duplicate portal profile handling. |
| Network-led applicant | Company context, culture info, compensation clues, interview prep, referrals, recruiter DMs, founder posts, warm intros, social proof | social/recruiter source kinds, recruiter DM draft policy | parked | Later: contact discovery, social heat map, company-context contacts, DM drafts, referral-help flow. |
| International remote seeker | Time zones, contractor legality, payment model, remote region fit | searchCountries, remoteRegions, preferredTimezones, compensation currency | partial | Need timezone-overlap prompts, employment/legal model prompts, payment/currency handling. |

## What ApplyCue Covers Well

### Volume With Control

Covered by:

- `mode`: `review`, `daily`, `push`
- `applicationsPerDay`
- `minimumFitToApply`
- `matchSettings.range`
- `buildRelaxPlan`

This maps well to:

- passive market check
- active search
- urgent "need interviews" search

### Role-Specific CVs

Covered by:

- proof bank
- CV tailoring package
- per-role CV variants
- unsupported claim pause reasons

This maps well to:

- career changers
- senior applicants
- active applicants
- urgent users who need customization at volume

### Dynamic Search Area

Covered by:

- `preferredLocations`
- `extraLocations`
- `askBeforeLocations`
- `searchCountries`
- `searchAreas`
- `remoteRegions`
- `agentMayExpandSearchArea`
- `informUserOnSearchAreaChange`

This maps well to:

- location-constrained users
- remote users
- users who want the agent to widen search without hiding the area

### Portal And Fraud Caution

Covered by:

- `trustedPortals`
- `askBeforePortals`
- `blockedPortals`
- `fraudSignalTerms`
- `defaultPortalApplyPolicy`

This maps well to:

- job-board-heavy users
- users allowing browser access
- scam/fraud avoidance

### Incremental Questions

Covered by:

- setup questionnaire
- pending question behavior
- pause reasons

This maps well to:

- visa/work authorization
- salary questions
- relocation
- source-specific apply rules
- role-specific form questions

## Biggest Gaps

### 1. Network Intelligence

Problem:

Many high-quality roles, especially senior roles, benefit from company context, culture information, compensation clues, interview preparation, and sometimes referrals through weak ties.

Need:

- social heat map by company
- approved contact-source search
- company-context contact list
- recruiter/founder/employee DM drafts
- user-presses-send workflow
- reply and insight tracking

Status: parked for next version.

### 2. Accessibility And Accommodation Preferences

Problem:

Disabled and neurodivergent job seekers may need remote work, accessible interviews, accommodation wording, and disclosure timing.

Need:

- accommodation preferences
- disclosure policy
- interview format preferences
- pause rules for medical/disability questions
- accessible interview request drafts

Status: gap.

### 3. Early-Career Proof Builder

Problem:

New grads often lack company-level proof and need projects, coursework, internships, hackathons, volunteer work, and portfolio proof mapped to roles.

Need:

- project proof builder
- education proof mapping
- internship/new-grad source pack
- assessment tracker

Status: partial.

### 4. Executive And Confidential Search Mode

Problem:

Senior users need confidentiality, target-company strategy, board/advisor/fractional paths, and outreach more than raw application volume.

Need:

- confidential mode
- target-company map
- board/advisor/fractional role support
- senior narrative builder
- network-intelligence workflow

Status: partial.

### 5. Mental Load And Motivation Support

Problem:

Job seekers face ghosting, repeated rejection, uncertain progress, and anxiety. A pure automation dashboard may still feel like a black box.

Need:

- simple weekly report
- reply-rate and interview-rate trends
- "what changed this week"
- "what we will try next"
- no vanity scores

Status: partial.

## Product Recommendations

### Keep Setup Small

Ask only:

- current company
- current designation and level
- current country/location
- whether to apply to past employers
- target role/designation/level
- employment type
- WFH/hybrid/WFO
- compensation floor
- notice period
- search country/location
- applications per day
- mode
- match range

Everything else should be asked when it first matters.

### Add Presets

Add simple presets:

```text
Market check: daily, 3-5/day, tight or normal
Active search: daily, 15-25/day, normal
Need interviews: push, 40-80/day, wide but inside hard rules
Confidential senior search: review/daily, low volume, network-intel later
Career change: daily, normal/wide, stronger proof mapping
Return to work: daily, flex-first, gap narrative
```

### Add New Config Areas Later

Do not overload initial config immediately, but plan for:

- `accessibilitySettings`
- `confidentialSearchSettings`
- `networkIntelSettings`
- `interviewSettings`
- `weeklyReportSettings`

## Source Notes

These sources informed the categories and pain points:

- iCIMS Candidate Experience Report: candidate ghosting, slow process, application friction, and communication issues.
- Greenhouse candidate/job-seeker reports: job search fatigue, candidate expectations, ghosting, and process transparency.
- NACE student reports: early-career and graduate hiring challenges.
- Handshake student/Gen Z reports: early-career search behavior and expectations.
- AARP older-worker resources and surveys: age discrimination and older-worker job search barriers.
- U.S. Department of Labor / BLS disability employment resources: disability employment participation and accessibility/accommodation context.
- Job Accommodation Network: accommodation and disclosure guidance.
- FlexJobs / remote-work surveys: remote/hybrid preference and flexibility needs.

Useful links:

- https://www.icims.com/resources/ebook/candidate-experience-report/
- https://www.greenhouse.com/resources
- https://www.naceweb.org/
- https://joinhandshake.com/reports/
- https://www.aarp.org/work/
- https://www.bls.gov/news.release/disabl.htm
- https://askjan.org/
- https://www.flexjobs.com/blog/
