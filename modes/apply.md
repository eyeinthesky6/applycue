# Mode: apply — Live Application Assistant

> Apply `voice-dna.md` (if present) to free-text answers and cover-letter fields — full guardrail, conversational voice included (Tier 1 + Tier 2). See `_shared.md` → Voice DNA.

Interactive mode for when the candidate is filling out an application form in Chrome. It reads what is on the screen, loads the previous context of the job, and generates personalized responses for each form question.

## Requirements

- **Best with Playwright in visible mode**: In visible mode, the candidate sees the browser and the agent can interact with the page.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.

## Workflow

```text
1. DETECT      → Read active Chrome tab (screenshot/URL/title)
2. IDENTIFY    → Extract company + role from the page
3. SEARCH      → Match against existing reports in reports/
4. LOAD        → Read full report + Section G (if it exists)
5. INSPECT     → Confirm posting liveness + company/role match without filling
6. ANALYZE     → Identify ALL visible form questions
7. GENERATE    → For each question, generate a personalized response
8. PREFLIGHT   → Record resolved visible fields, then get named approval
9. ATTEMPT     → Start receipt, fill/upload, and stop before submit unless approved
10. RECONCILE  → Record confirmed, unknown, failed, or abandoned outcome
```

## Step 5 — Preflight gate

Before generating any application answers, verify that the form still points to the intended active job. This gate runs after the page has been detected, the company/role has been identified, and the matching report has been loaded.

1. Read the visible URL, page title, company, role, and any closed/expired signals.
2. Check employer safety before doing form work:
   - current employer: always skip;
   - past employer: pause and ask for confirmation;
   - similar company/title: never treat it as an automatic duplicate. Compare the exact URL/full JD or leave it for agent review.
3. If a URL is available, verify liveness with the agent's available browser tool:
   - active posting evidence: title/role + job description or form fields + submit/apply path
   - closed posting evidence: expired/closed/no longer accepting applications, missing JD with only nav/footer, hard redirect to generic careers/search, or 404/410
4. Compare the visible company and role against the matched report.
4b. Run `node review-evidence.mjs check --job={tracker number}`. If it reports missing or stale evidence, stop and re-review the full live JD against the current preferences/CV before generating answers. `application-attempt.mjs start` enforces this again.
4c. Run `node cv-bundle.mjs check --job={tracker number} --cv="{exact PDF or DOCX selected for upload}"`. If it reports missing or stale evidence, regenerate/record the bundle or select the verified file. Do not accept Markdown, HTML, or a similarly named unverified file as the upload.
5. If company or title changed materially, stop before drafting and ask:
   "The form appears to be for [visible company] — [visible role], but the matched report is [report company] — [report role]. Do you want me to re-evaluate, adapt with this mismatch, or stop?"
6. If the posting appears closed, refuse to generate final copy unless the candidate explicitly overrides with a known reason.
7. If liveness cannot be verified because the candidate only pasted questions or a screenshot, state that limitation and ask the candidate to confirm the company, role, and active posting before drafting.

Do not continue to Step 6 until this inspection is resolved. After Steps 6–7 resolve the visible fields, record the durable preflight described in Step 8. The start command enforces that second gate.

**Applying to several roles in one sitting?** This preflight verifies the single form in front of you. Before a multi-role session — especially against scanner entries marked `**Verification:** unconfirmed (batch mode)` — run the `pipeline` mode **Liveness sweep** first (`node check-liveness.mjs --file <urls>`). It drops the dead postings from `data/pipeline.md` in one batch so you never open a tab on an expired role.

## Step 1 — Detect the job

**With Playwright:** Take a snapshot of the active page. Read title, URL, and visible content.

**Without Playwright:** Ask the candidate to:
- Share a screenshot of the form (Read tool can read images)
- Or paste the form questions as text
- Or say company + role so we can search for it

## Step 2 — Identify and search for context

1. Extract company name and role title from the page
2. Search in `reports/` by company name (case-insensitive grep)
3. If there is a match → load the full report
4. If there is a Section G → load previous draft answers as a base
5. If there is NO match → notify and offer to run a quick auto-pipeline

## Step 3 — Detect changes in the role

If the role on screen differs from the one evaluated:
- **Notify the candidate**: "The role has changed from [X] to [Y]. Do you want me to re-evaluate or adapt the responses to the new title?"
- **If adapt**: Adjust responses to the new role without re-evaluating, only after the candidate explicitly accepts the mismatch
- **If re-evaluate**: Execute full A-F evaluation, update report, regenerate Section G
- **Update tracker**: Change role title in applications.md if applicable

## Step 6 — Analyze form questions

Identify ALL visible questions:
- Free text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** → adapt the existing response
- **New question** → generate response from the report + cv.md

For each field, preserve the application form contract:
- `field_type`: `text`, `textarea`, `select`, `radio`, `checkbox`, `number`, `file`, or `unknown`
- `required`: `yes`, `no`, or `unknown`
- `limit`: exact character/word limit if visible; otherwise `unknown`
- `options`: visible options for select/radio/checkbox fields
- `needs_candidate_confirmation`: `yes` for legal, demographic, work authorization, visa, relocation, salary, disability, veteran, sponsorship, background-check, or self-identification questions unless the answer is explicitly present in `config/profile.yml`

Never invent answers for legal, demographic, work-authorization, visa/sponsorship, salary, disability, veteran, background-check, relocation, or self-identification fields. If the answer is not present in `config/profile.yml` or visible context, mark it as needing candidate confirmation and provide the safest question to ask the candidate.

For a reusable question, ask once. Save it only when the user explicitly approves reuse:

```text
node application-preflight.mjs approve-answer --field="notice_period" --value="<approved answer>" --alias="<visible question>" --actor=codex --approved-by-user
```

Use `--replace` only after the user approves changing an existing value. Passwords, OTPs, tokens, payment data, and identity-document numbers are one-off inputs and the helper refuses to store them.


## Step 7 — Generate responses

For each question, generate the response following:

1. **Report context**: Use proof points from block B, STAR stories from block F
2. **Previous Section G**: If a draft response exists, use it as a base and refine
3. **"I'm choosing you" tone**: Same auto-pipeline framework
4. **Specificity**: Reference something specific from the JD visible on screen
5. **ApplyCue proof point**: Include in "Additional info" if there is a field for it
6. **Recruiter-side risk map**: Use `modes/heuristics/recruiter-side.md` to identify what doubt the question is trying to resolve (motivation, stack fit, logistics, comp, work-auth, availability, seniority) and answer that doubt directly.
7. **Disclosure discipline**: Answer logistics questions truthfully when asked, but do not volunteer sensitive or HR-only details in unrelated motivation/fit answers.

**Output format:**

```text
## Responses for [Company] — [Role]

Based on: Report #NNN | Decision: apply | Rank: N | Confidence: high/medium/low | Archetype: [type]

---

### 1. [Exact form question]
> [Response ready for copy-paste, or "Ask candidate: ..." if the field needs confirmation]

### 2. [Next question]
> [Response]

...

---

Notes:
- [Any observations about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 8 — Durable preflight, approval, and attempt receipt

Before asking for final approval, write `data/application-preflight-input.json` as a JSON array with one record for every currently visible form field. Do not put answer values in this file:

```json
[
  {"field":"full_name","label":"Full name","type":"text","required":"yes","resolution":"profile","sourceRef":"candidate.full_name"},
  {"field":"notice_period","label":"When can you join?","type":"text","required":"yes","resolution":"approved_answer","sourceRef":"notice_period"},
  {"field":"resume","label":"Resume","type":"file","required":"yes","resolution":"selected_cv"},
  {"field":"motivation","label":"Why this role?","type":"textarea","required":"unknown","resolution":"agent_draft"}
]
```

Allowed resolutions are `profile`, `approved_answer`, `user_confirmed_once`, `agent_draft`, `selected_cv`, `approved_file`, and `missing`. `profile` uses a dot path from `config/profile.yml`; `approved_answer` uses the saved canonical field. Sensitive fields cannot use `agent_draft`. A one-off user answer needs a chat/evidence reference but its value is not stored.

Record the host browser inspection. Company/title comparison remains the agent's judgment; the flag records that it was actually done. This command does not fill, upload, or submit:

```text
node application-preflight.mjs record --job={tracker number} --company="{company}" --title="{role}" --url="{application URL}" --visible-url="{current browser URL}" --visible-company="{company shown on page}" --visible-title="{role shown on page}" --cv="{exact verified PDF or DOCX}" --stage=application_form --liveness=active --actor=codex --tool=chrome --fields-file=data/application-preflight-input.json --evidence="{browser snapshot/reference}" --identity-confirmed-by-agent --all-visible-fields-captured --inspection-only
```

If it returns `pause`, resolve the listed reason and record a fresh inspection. A job page, closed/unknown posting, incomplete visible-field list, missing required answer, sensitive inferred answer, changed approved answer, changed CV/review, or receipt older than 30 minutes cannot start an attempt.

Before typing into a live form, show the final company, role, URL, exact verified CV filename and any answers that still need confirmation. Ask for one explicit approval that names this application. Approval for one role never carries to another role. Approval may arrive in chat or through the dashboard's `Approve & apply` action; the latter is valid only for the exact CV bundle/file and live-form preflight recorded on that receipt.

After approval, start a durable receipt:

```text
node application-attempt.mjs start --job={tracker number} --company="{company}" --title="{role}" --url="{application URL}" --cv="{exact verified PDF or DOCX}" --approved-by-user
```

For dashboard approval, use the action receipt instead of restating chat approval:

```text
node application-attempt.mjs start --job={tracker number} --company="{company}" --title="{role}" --url="{application URL}" --cv="{exact verified PDF or DOCX}" --approval-receipt={dashboard action id}
```

Keep the returned `attemptId`. If the command says an earlier attempt is `started`, `unknown`, or `confirmed`, stop and reconcile it; do not click submit again.

The started receipt binds the current review, JD fingerprint, CV-bundle fingerprint, selected upload hash, live-form preflight, approved-answer fingerprint, and approval source. An unresolved dashboard CV-change request blocks start. A preflight and dashboard approval can each be used only once; inspect and approve again before a retry. Fill fields and upload that exact CV. A submission click is not proof of success.

## Step 9 — Reconcile the outcome

- `confirmed`: the page or a received confirmation gives clear evidence that the application was accepted;
- `unknown`: submit was clicked but the browser timed out, closed, redirected ambiguously, or gave no reliable confirmation;
- `failed`: the form clearly rejected the submission;
- `abandoned`: the user or agent intentionally stopped.

Record it immediately. The same command validates the attempt identity; for `confirmed`, it also updates the exact tracker row to `Applied` and rebuilds the derived tracker index. Other outcomes stay visible on that job without changing its lifecycle to Applied.

```text
node application-attempt.mjs finish --attempt={attemptId} --outcome={confirmed|unknown|failed|abandoned} --evidence="{brief visible evidence}"
```

Never retry an `unknown` attempt until the agent checks the portal or confirmation email and the user approves the retry.

## Step 10 — Post-apply

If the receipt is `confirmed`:
1. Verify the command returned `trackerStatus: Applied`; do not edit `applications.md` separately.
2. Update Section G of the report with the final responses.
3. Suggest next step: run the `contacto` mode (`/applycue contacto` where available) for LinkedIn outreach.

## Scroll handling

If the form has more questions than the visible ones:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the entire form is covered
