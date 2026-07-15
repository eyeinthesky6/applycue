# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, execute the ENTIRE pipeline in sequence:

A job URL supplied directly by the user defaults to **high stakes** unless the user says it is standard. Start this workflow ahead of standard queued work and carry that priority through the employer brief, review, evidence questions, and CV. If the agent decides `apply`, place it at the top of application preparation and re-rank the apply queue; `watch` or `skip` remains valid. Once the role has a job number, persist it with the existing `job-feedback.mjs` priority action and resolve the receipt after the deeper work is reflected in the artifacts. Scanner-discovered URLs remain standard unless the user upgrades them. Priority never bypasses the liveness or application gates below.

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), follow this strategy to extract the content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search for the role title + company in secondary portals that index the JD in static HTML.

**If no method works:** Ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): use directly, without needing to fetch.

## Step 0.5 — Liveness gate

Before running any evaluation, confirm the posting is still live. The Step 0 Playwright snapshot already holds the evidence — judge it now, before spending tokens on the A-G evaluation, the report, or a PDF. A 404/expired page silently served as a static fallback ("position filled", empty shell) otherwise scores a full evaluation against phantom content.

1. From the Step 0 snapshot/fetched content, classify the posting:
   - **active posting evidence:** title/role + a real job description or an application/apply path
   - **closed posting evidence:** expired/closed/"no longer accepting applications", missing JD with only nav/footer, hard redirect to a generic careers/search page, or 404/410
2. If the posting appears closed or the page is a dead/fallback shell, **stop here**: do not run Step 1–Step 4. Tell the candidate the link is dead, and if the entry came from `data/pipeline.md`, mark it `- [x] ~~Company | Role~~ — oferta nieaktywna`.
3. If only JD text was pasted (no URL), there is no link to verify — skip the gate and proceed.

Do not continue to Step 1 until this gate is resolved.

## Step 1 — A-G Review and agent decision

Execute the same as the `oferta` mode (read `modes/oferta.md` for all A-F blocks + Block G Posting Legitimacy).

The evaluation inherits `oferta`'s bounded research budget. Company, compensation, and hiring-signal lookup must not invoke `deep-research`, must not spawn subagents, and must stop at the shared query cap instead of escalating into open-ended research.

Re-read `config/profile.yml`, `modes/_profile.md`, and confirmed feedback before deciding. Record `apply`, `watch`, or `skip`, plus confidence, strengths, gaps, unknowns, preference basis, and a plain-language reason. Do not calculate or use a semantic fit score. When multiple roles are viable, compare the `apply` queue and give each an explicit rank.

## Step 2 — Save Report .md

Save the full evaluation in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/oferta.md`).
Include Block G in the saved report. Add **URL:** {url} and **Legitimacy:** {tier} to the report header.

Store the exact expanded JD through `review-evidence.mjs capture`; an email/card/snippet is not a valid full-JD capture.

## Step 3 — Generate application artifacts for `apply`

If the decision is `watch` or `skip`, retain the review report and move to the tracker. Do not generate a role CV or form answers unless the user asks.

If the decision is `apply`, read `config/profile.yml` and check `cv.output_format`:

- If `"latex"`, execute the full pipeline from `modes/latex.md`
- Otherwise (default), execute the full pipeline from `modes/pdf.md`

Keep durable Markdown/HTML source, generate both PDF and DOCX, and verify that each chosen file opens and names the correct company and role.

## Step 4 — Application draft for `apply`

Generate a draft of responses for the application form only after an `apply` decision:

1. **Extract form questions**: Use Playwright to navigate to the form and take a snapshot. If they cannot be extracted, use the generic questions.
2. **Generate responses** following the tone (see below).
3. **Save in the report** as section `## H) Draft Application Answers`.

### Generic questions (use if they cannot be extracted from the form)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for Form Answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for specific reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selective without arrogance**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: Always reference something REAL from the JD or the company, and something REAL from the candidate's experience
- **Direct, without fluff**: 2-4 sentences per response. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the statement**: Instead of "I'm great at X", say "I built X that does Y"

**Framework per question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something specific about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → A quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan] and selected after reviewing it against my criteria."

**Language**: Always in the language of the JD (EN default). Apply `/tech-translate`.

## Step 5 — Update Tracker

Write a tracker addition with `Score=N/A`, the explicit Decision, Rank, Confidence, `Origin=current`, Report, and the actual PDF state. Merge it through `merge-tracker.mjs`; do not hand-edit the canonical tracker.

After merge, bind the tracker row, report, captured JD, confirmed preferences, and candidate evidence with `review-evidence.mjs record`, then require `review-evidence.mjs check` to pass. Until it passes, the role is pending re-review and application start is blocked.

**If any step fails**, continue only where the remaining work is still valid and mark the failed step as pending. Never treat a missing full JD, missing approval, uncertain submit, or broken CV artifact as a successful application.
