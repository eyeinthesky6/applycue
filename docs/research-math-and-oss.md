# Research: Matching Math And OSS Options

Date: 2026-07-06

## Recommendation

Use advanced math only where it makes ApplyCue safer or more useful.

V1 should use:

1. deterministic rules and hard gates
2. requirement-to-proof matching
3. hybrid retrieval: keyword plus embedding similarity
4. reconciliation reports
5. outcome logging for later learning

Do not start with graph neural networks or custom contrastive training. They are useful later, but they need real interaction data.

## 1. Requirement-To-Proof Matching

Use this now.

Model the reconciliation problem as a bipartite matching:

```text
left side: job requirements
right side: approved facts and proof items
edge weight: support strength
```

Output:

- supported
- adjacent
- unsupported
- needs confirmation

This is the most important "advanced math" for ApplyCue because it prevents fabricated CV claims.

Implementation:

- start with a deterministic TypeScript matcher
- use simple weighted scoring first
- later use a Hungarian/linear assignment style algorithm if one-to-one matching matters

Current deterministic matcher notes:

- Job-post metadata such as `Reports To`, `Department`, `Location`, and provider appendices such as `NOT YOUR TECH STACK?` should be stripped before requirement extraction.
- Generic requirements such as `regulated industry` can be supported by approved banking, NBFC, lending, financial-services, compliance, or risk evidence. They must not be invented when that evidence is absent.
- Generic automation requirements can be supported only by approved automation-system evidence such as autopay, process/workflow automation, product digitisation, AI voicebot, or chatbot work. Generic AI or product-transformation wording alone is not enough.
- Unsupported requirements remain blockers unless they are proven to be non-requirement metadata/noise.

Useful reference:

- SciPy's `linear_sum_assignment` documents the assignment problem as minimum weight matching in bipartite graphs.
- NetworkX has bipartite matching utilities.

## 2. Hybrid Retrieval For Jobs

Use this now or soon.

The discovery/ranking stack should combine:

- keyword/BM25-style match
- normalized skills
- hard filters
- embedding similarity
- source trust
- recency
- user preferences

This is more robust than embeddings alone.

Reason:

- keyword match catches exact tools, locations, titles, work authorization
- embeddings catch adjacent wording
- hard gates keep the system inside user rules

LinkedIn's job matching work uses a retrieval-plus-ranking pattern at scale. ApplyCue can use the same shape locally without copying their infra.

Current ranker notes:

- Hard gates still run first.
- Backend priority is role-forward: role-objective fit carries the most weight, then proof, location, industry, keywords, source, and company signals.
- Weak role matches and adjacent-only titles remain capped below the user's fit floor, so sales/engineering/noisy board results do not fill application slots just because they mention product terms.
- Product engineering titles should not be treated as product-management roles unless the user explicitly targets that role family.

## 3. Skill Taxonomy And Normalization

Use later, but design for it now.

A skill taxonomy helps map:

```text
JS -> JavaScript
Product ops -> product operations
GenAI -> generative AI
```

Useful candidates:

- ESCO API and taxonomy
- SkillNER
- ESCO Skill Extractor
- Open Skills / skills-ml style tooling

For ApplyCue, taxonomy output should feed the fact ledger and requirement map. It should not directly write CV claims.

## 4. Contrastive Resume-Job Embeddings

Park until we have data.

ConFit is a strong research direction: it uses data augmentation and contrastive learning to place resumes and jobs into a shared embedding space. This is useful when we have many labeled outcomes.

For now:

- use off-the-shelf embeddings for rough semantic similarity
- do not fine-tune
- keep scores behind the scenes
- never use embedding similarity as proof of a fact

Embedding similarity can say:

```text
this job seems related
```

It cannot say:

```text
the user has done this work
```

## 5. Learning-To-Rank From Outcomes

Use later after enough applications.

Once ApplyCue tracks outcomes, train a ranking model from:

- applied
- ignored
- reply received
- interview
- offer
- rejection
- user feedback

Useful math:

- pairwise learning-to-rank
- LambdaMART / LambdaRank
- calibrated probability models

Use this to order future jobs, not to create CV claims.

## 6. Graph Neural Networks

Park.

LinkedIn's LinkSAGE-style work is real, but it needs a large graph of people, companies, jobs, applications, and outcomes.

ApplyCue v1 will not have that.

Possible later use:

- network intelligence
- company graph
- social heat map
- hidden adjacent roles
- "people like this got interviews from roles like that"

## 7. OSS Plumbing Worth Considering

Use these when the implementation layer needs them:

- Ajv: JSON Schema validation for fact ledger, CV plan, reconciliation report.
- JSON Resume: schema inspiration for structured CV facts.
- Mammoth.js: import `.docx` CVs into HTML/text.
- unified/remark: inspect Markdown output as an AST.
- Handlebars: render the single standard CV template from structured data.
- docx: generate `.docx` from structured content.
- Pandoc: convert Markdown/HTML to `.docx` or PDF if CLI export is acceptable.

## V1 Build Choice

Build this first:

```text
JD requirements -> requirement-to-proof map -> reconciliation report -> standard_ats_v1 CV
```

Then add hybrid search/ranking.

Then add learning from outcomes.

Everything else is later.
