# ApplyCue Discovery And Matching Architecture Research

Date: 2026-07-09

Status: research input, not an implementation claim. Current owners and remaining discovery/review ports are recorded in the [ApplyCue/Career-Ops integration plan](2026-07-14_applycue-career-ops-integration_architectural_review.md).

## Decision

ApplyCue should not depend on the user knowing every correct job title. The user gives seed roles, CVs, goals, constraints, and feedback. ApplyCue expands the search space, fetches jobs broadly, filters only hard blockers deterministically, and uses agent/LLM judgement for fuzzy relevance before CV generation and application.

The architecture should be a hybrid system:

```text
user CV + goals + seed roles
  -> profile and approved facts
  -> role/title expansion
  -> source planning
  -> broad discovery
  -> normalization and dedupe
  -> hard blockers
  -> semantic/agent fit review
  -> truthful CV generation
  -> browser/apply workflow
  -> outcome learning
```

Do not build one giant scoring formula. Use small, inspectable components with evidence, user feedback, and agent analysis.

## Research Evidence

### Job Discovery

Use prebuilt discovery tools instead of writing broad scrapers from scratch.

- JobSpy is MIT licensed and aggregates jobs from public boards such as LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, and other boards into a dataframe. It is good for broad supply, not final truth.
  Source: https://github.com/speedyapply/JobSpy
- Crawl4AI is useful later for public pages without clean APIs. It produces LLM-friendly Markdown/structured output and can handle dynamic pages.
  Source: https://docs.crawl4ai.com/
- Company ATS/public APIs should remain preferred where possible because they provide cleaner structured postings.

ApplyCue implication:

- Keep `JobSpy` as a board adapter.
- Keep direct ATS adapters for Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Breezy, Recruitee, Pinpoint, Workday, Personio, and Rippling.
- Add Crawl4AI only for public pages where no ATS/API/JobSpy route exists.
- Do not ask normal users to install these tools. The ApplyCue setup/agent flow owns installation.

### Role And Title Expansion

Seed titles are not enough. Job titles are messy and vary by company, country, and industry.

Useful sources:

- Lightcast Titles has around 75,000 standardized titles and a title-normalization API. It is strong for title chaos, but API access and terms must be checked per user/project.
  Source: https://lightcast.io/open-titles
  API: https://docs.lightcast.io/lightcast-api/reference/post_titles
- ESCO has occupations, alternative labels, skills, and an API. It is useful as an open taxonomy layer, especially outside the US.
  Source: https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api
- O*NET Web Services exposes the O*NET database, keyword search, occupation reports, skills, tasks, and related occupation services. It is useful for US/SOC-style occupation mapping and skill/task expansion.
  Source: https://services.onetcenter.org/

ApplyCue implication:

- Create a `role-expander` service.
- Inputs: seed title, CV summary, target industries, seniority, geography, approved exclusions, user feedback, and agent analysis.
- Outputs: candidate search terms grouped as:
  - `core`: close titles to search by default.
  - `nearby`: related titles to use when volume is low.
  - `explore`: noisy/pivot titles requiring review before applying.
  - `blocked`: titles the user rejected.
- Use ESCO/O*NET/Lightcast where available, plus user feedback and agent batch analysis.
- Agent may suggest new terms, but saved config decides what runs.

### Skills And Requirement Extraction

Matching should use skills/tasks/requirements, not title alone.

Useful sources:

- ESCO describes competence-based matching as comparing the jobseeker's knowledge, skills, and competences with employer requirements, with extracted information interpreted through linked ESCO pillars.
  Source: https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/competence-based-job-matching
- Recent ACL work on job vacancy/job seeker matching uses extracted skills mapped to ESCO plus knowledge-graph relationships and embeddings.
  Source: https://aclanthology.org/2025.genaik-1.15/
- SkillNER is an OSS Python module for extracting skills and certifications from resumes and job postings.
  Source: https://github.com/AnasAito/SkillNER

ApplyCue implication:

- Create a `requirement-extractor` sidecar first, not a gatekeeper.
- Extract hard requirements, role work, nice-to-have terms, and unsupported claims.
- Use extraction to explain and prioritize, not to invent CV facts.

### Retrieval And Fuzzy Matching

The matching architecture should use a two-stage retrieval shape:

```text
broad retrieval -> compact candidate set -> rerank/review -> action
```

Useful sources:

- Sentence Transformers supports embeddings, semantic search, and cross-encoder rerankers.
  Source: https://sbert.net/
- Sentence Transformers documents retrieve-and-rerank as a good pattern for complex search tasks.
  Source: https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html
- RapidFuzz is useful for fast title/company/location dedupe and fuzzy string matching.
  Source: https://rapidfuzz.github.io/RapidFuzz/
- Fuse.js is useful on the TypeScript side for local fuzzy search, weighted fields, and review UI filtering.
  Source: https://www.fusejs.io/

ApplyCue implication:

- Use lexical and deterministic filters for cheap blocking.
- Use RapidFuzz/Fuse for dedupe, title similarity, company similarity, and local UI search.
- Trial Sentence Transformers as an optional local Python sidecar for semantic retrieval/rerank over fetched jobs.
- Do not create new semantic fit scores. Keep any historical score field only for backward-readable records.
- Agent/LLM review should inspect borderline jobs and write reusable tuning signals.

## Tuning Loop

Tuning has three inputs:

- `user_feedback`: direct user judgement, such as "product marketing is noise" or "show more digital product roles".
- `agent_analysis`: agent review of a batch, such as "72 of 75 were filtered by title; add role variants before widening geography".
- `outcome_learning`: real outcomes, such as replies, interviews, offers, and rejections by source/title/company.

All tuning starts as a `TuningSignal`.

```text
signal -> proposed/approved/applied -> config change or no-op
```

Rules:

- Agent analysis may propose tuning, but it must not silently rewrite active preferences.
- Direct user feedback can be saved as approved tuning.
- Applying a tuning signal to active config must be a separate product action with dry-run support.
- Source code must not be edited for one user's tuning.
- The dashboard should show tuning suggestions in simple language, not scores.

Stored signal examples:

```json
{
  "origin": "agent_analysis",
  "target": "title_variant",
  "action": "promote",
  "value": "group product manager",
  "reason": "Several senior product roles from large companies use this title.",
  "status": "proposed"
}
```

```json
{
  "origin": "user_feedback",
  "target": "role_term",
  "action": "block",
  "value": "product marketing",
  "reason": "User said this is not a target role.",
  "status": "approved",
  "approvedByUser": true
}
```

## Build Order

1. Add role expansion config shape and generated expansion artifact.
2. Split generated terms into `core`, `nearby`, `explore`, and `blocked`.
3. Add tuning signals from user feedback and agent analysis.
4. Add a discovery calibration command that can fetch a large sample without generating CVs.
5. Add grouped calibration report:
   - sources searched
   - jobs fetched
   - duplicates blocked
   - hard blockers
   - role clusters
   - example good/bad jobs
   - proposed tuning signals
6. Use the implemented apply-tuning command to write approved changes to editable config after dry-run review.
7. Trial RapidFuzz/Fuse for dedupe/title matching.
8. Trial ESCO/O*NET/Lightcast lookup for expansion.
9. Trial SkillNER or ESCO extractor as a diagnostics sidecar.
10. Trial Sentence Transformers rerank on saved fetched jobs only.
11. Only then increase application automation volume.

## What To Avoid

- Do not ask users to supply exhaustive titles.
- Do not pretend 75 fetched jobs is market coverage.
- Do not make title matching a hard blocker except for obvious junior/intern/no-go terms.
- Do not expose fake precision scores as user-facing truth.
- Do not let agents hand-edit generated CVs for one application.
- Do not use paid/cloud APIs without user-owned credentials and explicit approval.
- Do not overfit to one user's current rejected examples by changing source code.

## Recommendation

Build ApplyCue as an agent-operated job search and application engine with deterministic safety and truth gates, taxonomy/library-assisted expansion, broad discovery, fuzzy dedupe, optional semantic rerank, agent judgement for messy fit, user feedback, and outcome learning stored as config-level tuning.
