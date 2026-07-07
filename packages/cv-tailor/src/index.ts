import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild
} from "docx";
import type {
  CvChange,
  CvContentPlan,
  CvVariant,
  FactCategory,
  JobRecord,
  JobRequirement,
  JobRequirementMatch,
  ProfileFact,
  ProofItem,
  ReconciliationIssue,
  ReconciliationReport,
  RequirementMatchStatus,
  UserProfile,
  WorkHistoryItem
} from "@applycue/core";

export interface CvGenerationResult {
  contentPlan: CvContentPlan;
  html: string;
  markdown: string;
  reconciliationReport: ReconciliationReport;
  variant: CvVariant;
}

interface RequirementTerm {
  aliases?: string[];
  category: FactCategory;
  text: string;
}

interface MatchedCvEvidence {
  factStatements: string[];
  proofItems: ProofItem[];
  supportedRequirements: string[];
}

interface RenderedExperience {
  markdown: string;
  usedProofIds: Set<string>;
}

const TEMPLATE_ID = "applycue_standard_ats_v1";

const REQUIREMENT_TERMS: RequirementTerm[] = [
  { text: "ai", aliases: ["artificial intelligence", "genai", "generative ai"], category: "skill" },
  {
    text: "automation",
    aliases: ["automate", "automated", "automating", "workflow automation", "process automation"],
    category: "skill"
  },
  { text: "transformation", category: "role" },
  { text: "product strategy", category: "role" },
  { text: "product roadmap", category: "role" },
  { text: "product manager", category: "role" },
  { text: "chief of staff", category: "role" },
  { text: "leadership", category: "role" },
  { text: "fintech", category: "industry" },
  { text: "payments", aliases: ["payment gateway", "digital payments", "embedded payments", "upi payments"], category: "industry" },
  { text: "digital banking", aliases: ["banking", "neobank"], category: "industry" },
  { text: "go to market", aliases: ["gtm", "gtm strategy", "commercial strategy"], category: "role" },
  { text: "customer acquisition", aliases: ["digital acquisition"], category: "role" },
  { text: "conversion", aliases: ["conversion optimization", "conversion optimisation"], category: "metric" },
  { text: "retention", aliases: ["customer retention"], category: "metric" },
  { text: "revenue optimization", aliases: ["revenue optimisation", "monetization", "monetisation", "pricing"], category: "metric" },
  { text: "stakeholder management", aliases: ["stakeholder communication", "cross functional"], category: "role" },
  { text: "zero to one", aliases: ["0 to 1", "zero-to-one"], category: "role" },
  { text: "b2b saas", aliases: ["b2b2c", "b2b software"], category: "industry" },
  {
    text: "regulated industry",
    aliases: ["regulated", "compliance-sensitive", "compliance"],
    category: "industry"
  },
  { text: "saas", aliases: ["software as a service", "b2b saas", "chat saas"], category: "industry" },
  { text: "enterprise software", category: "industry" },
  { text: "python", category: "tool" },
  { text: "healthcare compliance", category: "industry" },
  { text: "store operations", category: "role" },
  { text: "retail staffing", category: "role" },
  { text: "founder priorities", category: "role" },
  { text: "product operations", category: "role" }
];

export function generateJobSpecificCv(job: JobRecord, profile: UserProfile): CvGenerationResult {
  const contentPlan = createCvContentPlan(job, profile);
  const reconciliationReport = reconcileCvContentPlan(contentPlan);
  const variant = createCvVariantFromPlan(job, contentPlan, reconciliationReport);
  const markdown = renderStandardAtsMarkdown(variant, profile);
  return {
    contentPlan,
    html: renderStandardAtsHtml(markdown, variant),
    markdown,
    reconciliationReport,
    variant
  };
}

export function createCvVariant(job: JobRecord, profile: UserProfile): CvVariant {
  return generateJobSpecificCv(job, profile).variant;
}

export function createCvContentPlan(job: JobRecord, profile: UserProfile): CvContentPlan {
  const requirements = extractJobRequirements(job, profile);
  const requirementMatches = requirements.map((requirement) => matchRequirement(requirement, profile));
  const changes = buildCvChanges(requirementMatches, requirements);
  const unsupportedRequirements = requirementMatches
    .filter((match) => match.status === "unsupported")
    .map((match) => match.requirement);

  return {
    id: `${job.id}-content-plan-standard-ats-v1`,
    jobId: job.id,
    formatMode: "standard_ats_v1",
    templateId: TEMPLATE_ID,
    requirements,
    requirementMatches,
    changes,
    unsupportedRequirements,
    createdAt: new Date().toISOString()
  };
}

export function extractJobRequirements(job: JobRecord, profile?: UserProfile): JobRequirement[] {
  const text = normalizeText(`${job.title} ${stripNonRequirementMetadata(job.description)}`);
  const terms = mergeRequirementTerms(profile);
  const requirements = terms
    .filter((term) => termMatches(text, term))
    .map((term) => ({
      id: `${job.id}-requirement-${slugify(term.text)}`,
      text: term.text,
      category: term.category,
      required: true,
      source: "job_description" as const
    }));

  return dedupeRequirements(requirements);
}

export function matchRequirement(requirement: JobRequirement, profile: UserProfile): JobRequirementMatch {
  const proofMatches = findProofForRequirement(requirement.text, profile.proofBank);
  const factMatches = findFactsForRequirement(requirement.text, profile.facts ?? []);
  const proofItemIds = proofMatches.map((proof) => proof.id);
  const factIds = factMatches.map((fact) => fact.id);
  const exactSupport = proofMatches.some((proof) => proofExactlySupports(requirement.text, proof)) ||
    factMatches.some((fact) => factExactlySupports(requirement.text, fact));
  const adjacentSupport = proofMatches.length > 0 || factMatches.length > 0;
  const status: RequirementMatchStatus = exactSupport
    ? "supported"
    : adjacentSupport
      ? "needs_confirmation"
      : "unsupported";

  return {
    requirementId: requirement.id,
    requirement: requirement.text,
    status,
    proofItemIds,
    ...(factIds.length > 0 ? { factIds } : {}),
    note: createRequirementNote(requirement.text, status, proofMatches, factMatches)
  };
}

export function reconcileCvContentPlan(plan: CvContentPlan): ReconciliationReport {
  const issues: ReconciliationIssue[] = [];
  for (const match of plan.requirementMatches) {
    const requirement = plan.requirements.find((item) => item.id === match.requirementId);
    if (!requirement) continue;

    if (match.status === "unsupported" && requirement.required) {
      issues.push({
        id: `${match.requirementId}-unsupported`,
        severity: "blocker",
        message: `Unsupported requirement must not be claimed: ${match.requirement}`,
        requirementId: match.requirementId,
        factIds: match.factIds ?? [],
        proofItemIds: match.proofItemIds
      });
      continue;
    }

    if ((match.status === "adjacent" || match.status === "needs_confirmation") && requirement.required) {
      issues.push({
        id: `${match.requirementId}-needs-confirmation`,
        severity: "needs_confirmation",
        message: `Adjacent requirement evidence needs user confirmation before it can shape the CV: ${match.requirement}`,
        requirementId: match.requirementId,
        factIds: match.factIds ?? [],
        proofItemIds: match.proofItemIds
      });
    }
  }

  const status = issues.some((issue) => issue.severity === "blocker")
    ? "blocked"
    : issues.some((issue) => issue.severity === "needs_confirmation")
      ? "needs_user_confirmation"
      : "passed";

  return {
    id: `${plan.id}-reconciliation`,
    cvContentPlanId: plan.id,
    status,
    issues,
    coverage: buildRequirementCoverage(plan.requirementMatches, plan.requirements),
    checkedAt: new Date().toISOString()
  };
}

export function renderStandardAtsMarkdown(variant: CvVariant, profile: UserProfile): string {
  const contact = renderContact(profile);
  const summary = renderSummary(variant, profile);
  const skills = renderSkillList(variant);
  const matchedEvidence = getMatchedCvEvidence(variant, profile);
  const experience = renderExperienceSection(matchedEvidence, profile);
  const selectedImpact = renderSelectedImpact(matchedEvidence, experience.usedProofIds);
  const awards = renderBaseCvSection(profile, /^awards\b/i, [/^education$/i], 8);
  const education = renderBaseCvSection(profile, /^education$/i, [], 6);
  const sections = [
    `# ${profile.name ?? "Candidate"}`,
    contact,
    `## Summary\n\n${summary}`,
    skills ? `## Core Skills\n\n${skills}` : "",
    experience.markdown ? `## Experience\n\n${experience.markdown}` : "",
    selectedImpact ? `## Selected Impact\n\n${selectedImpact}` : "",
    awards ? `## Awards And Engagements\n\n${awards}` : "",
    education ? `## Education\n\n${education}` : "",
    variant.reconciliationStatus === "passed"
      ? ""
      : `## CV Status\n\nPaused until reconciliation passes. See the reconciliation report for details.`
  ].filter((section) => section.trim().length > 0);

  return `${sections.join("\n\n")}\n`;
}

export function renderStandardAtsHtml(markdown: string, variant?: CvVariant): string {
  const title = variant?.label ?? "ApplyCue CV";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * {
      box-sizing: border-box;
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "clig" 0, "dlig" 0;
    }
    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      background: #f4f6f8;
      color: #172033;
      font-family: "Liberation Sans", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif;
      font-size: 11px;
      line-height: 1.55;
    }
    .page {
      width: min(100%, 860px);
      margin: 0 auto;
      background: #ffffff;
      padding: 32px 38px;
    }
    .cv-header {
      margin-bottom: 18px;
      padding-bottom: 10px;
      border-bottom: 2px solid #1d6f7a;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .contact-row {
      margin: 0;
      color: #4e5c70;
      font-size: 10.5px;
      overflow-wrap: anywhere;
    }
    .cv-section {
      margin: 0 0 16px;
      break-inside: auto;
      page-break-inside: auto;
    }
    h2 {
      margin: 0 0 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #d9e1ea;
      color: #1d6f7a;
      font-size: 12px;
      line-height: 1.2;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      break-after: avoid;
      page-break-after: avoid;
    }
    h3 {
      margin: 12px 0 5px;
      color: #31435a;
      font-size: 12px;
      line-height: 1.25;
      break-after: avoid;
      page-break-after: avoid;
    }
    p {
      margin: 0 0 8px;
    }
    ul {
      margin: 0 0 8px;
      padding-left: 18px;
    }
    li {
      margin-bottom: 3px;
      overflow-wrap: anywhere;
    }
    .cv-role {
      margin-bottom: 10px;
    }
    @media print {
      body { background: #ffffff; }
      .page {
        width: 100%;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="page" data-template-id="applycue_standard_ats_v1">
${markdownToHtml(markdown)}
  </main>
</body>
</html>`;
}

export async function renderStandardAtsDocx(markdown: string): Promise<Buffer> {
  const children = markdownToDocxParagraphs(markdown);
  const document = new Document({
    creator: "ApplyCue",
    title: "ApplyCue generated CV",
    description: "Truth-checked standard_ats_v1 CV generated by ApplyCue.",
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720
            }
          }
        },
        children
      }
    ]
  });

  return Packer.toBuffer(document);
}

export function findMatchedProof(job: JobRecord, proofBank: ProofItem[]): ProofItem[] {
  const jobText = normalizeText(`${job.title} ${job.company} ${job.description}`);
  return proofBank.filter((proof) => proofMatchesText(jobText, proof));
}

function createCvVariantFromPlan(
  job: JobRecord,
  plan: CvContentPlan,
  report: ReconciliationReport
): CvVariant {
  return {
    id: `${job.id}-cv-standard-ats-v1`,
    jobId: job.id,
    label: `${job.company} - ${job.title}`,
    formatMode: "standard_ats_v1",
    templateId: TEMPLATE_ID,
    requirementMatches: plan.requirementMatches,
    unsupportedRequirements: plan.unsupportedRequirements,
    reconciliationStatus: report.status,
    reconciliationNotes: report.issues.map((issue) => issue.message),
    changes: plan.changes,
    createdAt: new Date().toISOString()
  };
}

function buildCvChanges(matches: JobRequirementMatch[], requirements: JobRequirement[]): CvChange[] {
  return matches
    .filter((match) => match.status === "supported" || match.status === "adjacent" || match.status === "needs_confirmation")
    .map((match) => {
      const requirement = requirements.find((item) => item.id === match.requirementId);
      const needsApproval = match.status !== "supported" && Boolean(requirement?.required);
      return {
        section: "Experience",
        change: match.status === "supported"
          ? `Emphasize supported evidence for ${match.requirement}.`
          : `Hold adjacent evidence for ${match.requirement} until the user confirms it.`,
        proofItemIds: match.proofItemIds,
        ...(match.factIds ? { factIds: match.factIds } : {}),
        ...(needsApproval ? { requiresUserApproval: true } : {})
      };
    });
}

function findProofForRequirement(requirement: string, proofBank: ProofItem[]): ProofItem[] {
  const requirementText = normalizeText(requirement);
  const requirementTerms = supportTerms(requirement);
  const requirementTokens = significantTokens(requirementText);
  return proofBank.filter((proof) => {
    const proofText = normalizeText(`${proof.claim} ${proof.evidence} ${proof.tags.join(" ")}`);
    return requirementTerms.some((term) => proofText.includes(term)) ||
      hasStrongTokenSupport(requirementTokens, significantTokens(proofText));
  });
}

function findFactsForRequirement(requirement: string, facts: ProfileFact[]): ProfileFact[] {
  const requirementText = normalizeText(requirement);
  const requirementTerms = supportTerms(requirement);
  const requirementTokens = significantTokens(requirementText);
  return facts
    .filter((fact) => fact.approvedByUser)
    .filter((fact) => {
      const factText = normalizeText(fact.statement);
      return requirementTerms.some((term) => factText.includes(term)) ||
        hasStrongTokenSupport(requirementTokens, significantTokens(factText));
    });
}

function proofMatchesText(text: string, proof: ProofItem): boolean {
  const normalizedText = normalizeText(text);
  const proofText = normalizeText(`${proof.claim} ${proof.evidence} ${proof.tags.join(" ")}`);
  return proof.tags.some((tag) => normalizedText.includes(normalizeText(tag))) ||
    proofText.includes(normalizedText) ||
    hasStrongTokenSupport(significantTokens(normalizedText), significantTokens(proofText));
}

function factMatchesText(text: string, fact: ProfileFact): boolean {
  const normalizedText = normalizeText(text);
  const factText = normalizeText(fact.statement);
  return factText.includes(normalizedText) ||
    hasStrongTokenSupport(significantTokens(normalizedText), significantTokens(factText));
}

function proofExactlySupports(requirement: string, proof: ProofItem): boolean {
  const requirementTerms = supportTerms(requirement);
  const proofText = normalizeText(`${proof.claim} ${proof.evidence}`);
  return requirementTerms.some((requirementText) =>
    proof.tags.some((tag) => normalizeText(tag) === requirementText) || proofText.includes(requirementText)
  );
}

function factExactlySupports(requirement: string, fact: ProfileFact): boolean {
  const factText = normalizeText(fact.statement);
  return supportTerms(requirement).some((requirementText) => factText.includes(requirementText));
}

function supportTerms(requirement: string): string[] {
  const normalized = normalizeText(requirement);
  const aliases: Record<string, string[]> = {
    automation: [
      "automate",
      "automated",
      "automating",
      "workflow automation",
      "process automation",
      "product digitisation",
      "product digitization",
      "digitisation",
      "digitization",
      "autopay",
      "auto pay",
      "voicebot",
      "chatbot"
    ],
    "product manager": [
      "product management",
      "product leadership",
      "product roadmap",
      "product strategy",
      "vp product",
      "head of product"
    ],
    "product roadmap": ["roadmap", "product roadmapping"],
    "regulated industry": [
      "regulated",
      "compliance",
      "bank",
      "banking",
      "digital banking",
      "nbfc",
      "lending",
      "financial services",
      "risk"
    ],
    payments: ["payment gateway", "digital payments", "embedded payments", "upi", "upi autopay", "brand emi"],
    "digital banking": ["banking", "neobank", "savings account", "facebook banking", "twitter banking", "e locker"],
    saas: ["software as a service", "b2b saas", "chat saas", "saas fintech"],
    "go to market": ["gtm", "gtm strategy", "commercial strategy", "market launch"],
    "customer acquisition": ["digital acquisition"],
    conversion: ["conversion optimization", "conversion optimisation"],
    retention: ["customer retention"],
    "revenue optimization": ["revenue optimisation", "monetization", "monetisation", "pricing", "cost reduction"],
    "stakeholder management": ["stakeholder communication", "cross functional", "investor relations"],
    "zero to one": ["0 to 1", "zero to one", "built from zero"],
    "b2b saas": ["b2b2c", "b2b software", "saas fintech", "chat saas"]
  };
  return [normalized, ...(aliases[normalized] ?? []).map(normalizeText)];
}

function createRequirementNote(
  requirement: string,
  status: RequirementMatchStatus,
  proofMatches: ProofItem[],
  factMatches: ProfileFact[]
): string {
  if (status === "supported") {
    const directProof = proofMatches.find((proof) => proofExactlySupports(requirement, proof));
    const directFact = factMatches.find((fact) => factExactlySupports(requirement, fact));
    const source = directProof?.claim ?? directFact?.statement ?? proofMatches[0]?.claim ?? factMatches[0]?.statement ?? requirement;
    return `Supported by approved evidence: ${source}`;
  }
  if (status === "adjacent") {
    const source = proofMatches[0]?.claim ?? factMatches[0]?.statement ?? requirement;
    return `Adjacent support only; do not state as direct experience without confirmation: ${source}`;
  }
  if (status === "needs_confirmation") {
    const source = proofMatches[0]?.claim ?? factMatches[0]?.statement ?? requirement;
    return `Needs user confirmation before it can shape this CV: ${source}`;
  }
  return "No approved fact or proof item supports this requirement.";
}

function buildRequirementCoverage(
  matches: JobRequirementMatch[],
  requirements: JobRequirement[]
): ReconciliationReport["coverage"] {
  const requiredIds = new Set(requirements.filter((requirement) => requirement.required).map((requirement) => requirement.id));
  const requiredMatches = matches.filter((match) => requiredIds.has(match.requirementId));
  return {
    totalRequired: requiredMatches.length,
    supported: requiredMatches.filter((match) => match.status === "supported").length,
    needsConfirmation: requiredMatches.filter((match) => match.status === "needs_confirmation").length,
    adjacent: requiredMatches.filter((match) => match.status === "adjacent").length,
    unsupported: requiredMatches.filter((match) => match.status === "unsupported").length
  };
}

function mergeRequirementTerms(profile?: UserProfile): RequirementTerm[] {
  const dynamicTerms: RequirementTerm[] = [];
  if (profile) {
    for (const term of [
      ...profile.preferences.targetRoleTerms,
      ...profile.preferences.requiredKeywords,
      ...profile.preferences.niceToHaveKeywords,
      ...profile.proofBank.flatMap((proof) => proof.tags)
    ]) {
      dynamicTerms.push({ text: term, category: inferCategory(term) });
    }
  }
  return [...REQUIREMENT_TERMS, ...dynamicTerms];
}

function dedupeRequirements(requirements: JobRequirement[]): JobRequirement[] {
  const seen = new Set<string>();
  const unique: JobRequirement[] = [];
  for (const requirement of requirements) {
    const key = normalizeText(requirement.text);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(requirement);
  }
  return unique;
}

function termMatches(text: string, term: RequirementTerm): boolean {
  const terms = [term.text, ...(term.aliases ?? [])].map(normalizeText);
  return terms.some((candidate) => text.includes(candidate));
}

function stripNonRequirementMetadata(description: string): string {
  const withoutProviderAppendices = stripKnownProviderAppendices(description);
  const metadataLabels = [
    "reports to",
    "reporting to",
    "department",
    "function",
    "location",
    "employment type",
    "job type",
    "contract type"
  ];
  const keptLines: string[] = [];
  let skippingLabelBlock = false;
  let skippedBlockContent = false;

  for (const line of withoutProviderAppendices.split(/\r\n|\n|\r/)) {
    const normalized = normalizeText(line);

    if (skippingLabelBlock) {
      if (!normalized) {
        if (skippedBlockContent) {
          skippingLabelBlock = false;
          skippedBlockContent = false;
        }
        continue;
      }
      skippedBlockContent = true;
      continue;
    }

    const exactLabel = metadataLabels.includes(normalized);
    const inlineMetadata = metadataLabels.some((label) => normalized.startsWith(`${label} `));
    if (exactLabel) {
      skippingLabelBlock = true;
      continue;
    }
    if (inlineMetadata) continue;

    keptLines.push(line);
  }

  return keptLines.join("\n");
}

function stripKnownProviderAppendices(description: string): string {
  return description.replace(/\bnot your tech stack\?[\s\S]*$/i, "");
}

function inferCategory(term: string): FactCategory {
  const normalized = normalizeText(term);
  if (["fintech", "saas", "healthcare", "retail", "enterprise"].some((word) => normalized.includes(word))) {
    return "industry";
  }
  if (["python", "javascript", "typescript", "sql"].some((word) => normalized.includes(word))) {
    return "tool";
  }
  if (["manager", "strategy", "lead", "head", "director", "chief"].some((word) => normalized.includes(word))) {
    return "role";
  }
  return "skill";
}

function renderSummary(variant: CvVariant, profile: UserProfile): string {
  const supportedTerms = variant.requirementMatches
    .filter((match) => match.status === "supported")
    .map((match) => titleCase(match.requirement))
    .slice(0, 5);
  const headline = profile.headline ?? "Proof-backed candidate";
  if (supportedTerms.length === 0) return headline;
  return `${headline} with approved evidence across ${supportedTerms.join(", ")}.`;
}

function renderSkillList(variant: CvVariant): string {
  const skills = uniqueValues(
    variant.requirementMatches
      .filter((match) => match.status === "supported")
      .map((match) => titleCase(match.requirement))
  );
  return skills.map((skill) => `- ${skill}`).join("\n");
}

function renderExperienceHeader(profile: UserProfile): string {
  if (profile.currentDesignation && profile.currentCompany) {
    return `${profile.currentDesignation}, ${profile.currentCompany}`;
  }
  return profile.currentDesignation ?? profile.headline ?? "Relevant Experience";
}

function getMatchedCvEvidence(variant: CvVariant, profile: UserProfile): MatchedCvEvidence {
  const proofIds = new Set(
    variant.requirementMatches
      .filter((match) => match.status === "supported")
      .flatMap((match) => match.proofItemIds)
  );
  const factIds = new Set(
    variant.requirementMatches
      .filter((match) => match.status === "supported")
      .flatMap((match) => match.factIds ?? [])
  );
  const proofItems = profile.proofBank.filter((proof) => proofIds.has(proof.id));
  const factStatements = (profile.facts ?? [])
    .filter((fact) => factIds.has(fact.id))
    .filter((fact) => !normalizeText(fact.statement).startsWith("current designation is"))
    .map((fact) => fact.statement);

  return {
    factStatements: uniqueValues(factStatements),
    proofItems: uniqueProofItems(proofItems),
    supportedRequirements: uniqueValues(
      variant.requirementMatches
        .filter((match) => match.status === "supported")
        .map((match) => match.requirement)
    )
  };
}

function renderExperienceSection(evidence: MatchedCvEvidence, profile: UserProfile): RenderedExperience {
  const usedProofIds = new Set<string>();
  const baseCvBullets = extractBaseCvEmployerBullets(profile.baseCvText ?? "", profile.pastEmployers);
  const relevanceTerms = cvEvidenceTerms(evidence);
  const employerSections = profile.pastEmployers
    .map((employer) =>
      renderEmployerSection(
        employer,
        evidence.proofItems,
        selectRelevantBaseCvBullets(baseCvBullets.get(normalizeText(employer.company)) ?? [], relevanceTerms),
        usedProofIds
      )
    )
    .filter(Boolean);

  if (employerSections.length > 0) {
    return {
      markdown: employerSections.join("\n\n"),
      usedProofIds
    };
  }

  const fallbackBullets = evidence.proofItems.map((proof) => proof.claim);
  const bullets = fallbackBullets.length > 0 ? fallbackBullets : evidence.factStatements;
  if (bullets.length === 0) {
    return {
      markdown: "",
      usedProofIds
    };
  }

  for (const proof of evidence.proofItems) {
    usedProofIds.add(proof.id);
  }

  return {
    markdown: `### ${renderExperienceHeader(profile)}\n\n${renderBullets(bullets)}`,
    usedProofIds
  };
}

function renderEmployerSection(
  employer: WorkHistoryItem,
  proofItems: ProofItem[],
  baseCvBullets: string[],
  usedProofIds: Set<string>
): string {
  const heading = renderEmployerHeading(employer);
  const employerProof = proofItems
    .filter((proof) => proofMatchesEmployer(proof, employer))
    .slice(0, 3);
  for (const proof of employerProof) {
    usedProofIds.add(proof.id);
  }
  const bullets = renderBullets([...employerProof.map((proof) => proof.claim), ...baseCvBullets].slice(0, 5));
  return bullets ? `### ${heading}\n\n${bullets}` : "";
}

function renderEmployerHeading(employer: WorkHistoryItem): string {
  const roleAndCompany = [employer.designation, employer.company].filter(Boolean).join(", ");
  const dates = [employer.startDate, employer.endDate].filter(Boolean).join(" - ");
  return dates ? `${roleAndCompany} (${dates})` : roleAndCompany;
}

function proofMatchesEmployer(proof: ProofItem, employer: WorkHistoryItem): boolean {
  const company = normalizeText(employer.company);
  const designation = normalizeText(employer.designation ?? "");
  const proofText = normalizeText(`${proof.claim} ${proof.evidence} ${proof.source ?? ""}`);
  return proofText.includes(company) || (designation.length > 0 && proofText.includes(designation));
}

function renderSelectedImpact(evidence: MatchedCvEvidence, usedProofIds: Set<string>): string {
  const remainingProof = evidence.proofItems
    .filter((proof) => !usedProofIds.has(proof.id))
    .map((proof) => proof.claim);
  const bullets = remainingProof.length > 0 ? remainingProof : evidence.factStatements;
  return renderBullets(bullets.slice(0, 8));
}

function renderBullets(values: string[]): string {
  return uniqueSimilarValues(values)
    .filter(Boolean)
    .map((bullet) => `- ${bullet}`)
    .join("\n");
}

function renderBaseCvSection(
  profile: UserProfile,
  startMatcher: RegExp,
  endMatchers: RegExp[],
  maxLines: number
): string {
  const lines = cleanedBaseCvLines(profile.baseCvText ?? "");
  const startIndex = lines.findIndex((line) => startMatcher.test(line));
  if (startIndex === -1) return "";
  const content: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (endMatchers.some((matcher) => matcher.test(line))) break;
    content.push(line);
    if (content.length >= maxLines) break;
  }
  return renderBullets(content);
}

function extractBaseCvEmployerBullets(text: string, employers: WorkHistoryItem[]): Map<string, string[]> {
  const lines = cleanedBaseCvLines(text);
  const starts = employers
    .map((employer) => ({
      employer,
      index: lines.findIndex((line) => lineMatchesEmployer(line, employer))
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  const byCompany = new Map<string, string[]>();

  for (let index = 0; index < starts.length; index += 1) {
    const current = starts[index]!;
    const nextStart = starts[index + 1]?.index ?? lines.length;
    const sectionEnd = findBaseCvExperienceSectionEnd(lines, current.index + 1, nextStart);
    const bullets = lines
      .slice(current.index + 1, sectionEnd)
      .filter((line) => isBaseCvExperienceBullet(line, employers))
      .map(cleanBaseCvBullet);
    byCompany.set(normalizeText(current.employer.company), uniqueValues(bullets));
  }

  return byCompany;
}

function lineMatchesEmployer(line: string, employer: WorkHistoryItem): boolean {
  const normalizedLine = normalizeText(line);
  return normalizedLine.includes(normalizeText(employer.company));
}

function findBaseCvExperienceSectionEnd(lines: string[], startIndex: number, fallbackEnd: number): number {
  for (let index = startIndex; index < fallbackEnd; index += 1) {
    if (/^(awards|education)\b/i.test(lines[index] ?? "")) return index;
  }
  return fallbackEnd;
}

function isBaseCvExperienceBullet(line: string, employers: WorkHistoryItem[]): boolean {
  const normalized = normalizeText(line);
  if (!normalized) return false;
  if (line.length < 24) return false;
  if (/^(roles|key responsibilities|key skills|awards|education)\b/i.test(line)) return false;
  if (/^[a-z]{3,}\s*[\u2019']?\d{2}\b/i.test(line)) return false;
  if (/^\d{4}\b/.test(line)) return false;
  if (employers.some((employer) => normalized.includes(normalizeText(employer.company)))) return false;
  return true;
}

function cleanBaseCvBullet(line: string): string {
  return line.replace(/^[-•*]\s*/, "").replace(/\s+/g, " ").trim();
}

function selectRelevantBaseCvBullets(bullets: string[], terms: string[], limit = 3): string[] {
  if (bullets.length === 0) return [];
  const scored = bullets.map((bullet, index) => ({
    bullet,
    index,
    score: scoreBaseCvBullet(bullet, terms)
  }));
  const relevant = scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.bullet);
  if (relevant.length > 0) return relevant;
  return bullets.slice(0, Math.min(2, limit));
}

function scoreBaseCvBullet(bullet: string, terms: string[]): number {
  const text = normalizeText(bullet);
  return terms.filter((term) => term && text.includes(term)).length;
}

function cvEvidenceTerms(evidence: MatchedCvEvidence): string[] {
  const rawTerms = [
    ...evidence.supportedRequirements,
    ...evidence.factStatements,
    ...evidence.proofItems.flatMap((proof) => [proof.claim, proof.evidence, ...proof.tags])
  ];
  return uniqueValues(rawTerms.flatMap((term) => significantTokens(term))).filter((term) => term.length > 2);
}

function cleanedBaseCvLines(text: string): string[] {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function renderContact(profile: UserProfile): string {
  const parts = [
    profile.contact?.email,
    profile.contact?.phone,
    profile.contact?.location ?? profile.currentLocation,
    ...(profile.contact?.links?.map((link) => link.url) ?? [])
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "";
}

function hasStrongTokenSupport(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  const matches = left.filter((token) => rightSet.has(token)).length;
  if (matches === 0) return false;
  const requiredMatches = left.length <= 2 ? left.length : 2;
  return matches >= requiredMatches && matches / left.length >= 0.67;
}

function significantTokens(value: string): string[] {
  const stop = new Set(["and", "or", "the", "for", "with", "to", "of", "in", "a", "an"]);
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stop.has(token))
    .map(canonicalSignificantToken);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalSignificantToken(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function titleCase(value: string): string {
  const acronyms = new Map([
    ["ai", "AI"],
    ["api", "API"],
    ["b2b", "B2B"],
    ["b2b2c", "B2B2C"],
    ["cvp", "CVP"],
    ["emi", "EMI"],
    ["ev", "EV"],
    ["fintech", "FinTech"],
    ["gtm", "GTM"],
    ["nbfc", "NBFC"],
    ["nps", "NPS"],
    ["qr", "QR"],
    ["saas", "SaaS"],
    ["sql", "SQL"],
    ["upi", "UPI"],
    ["vp", "VP"]
  ]);
  return normalizeText(value)
    .split(" ")
    .map((word) => acronyms.get(word) ?? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function markdownToHtml(markdown: string): string {
  const html: string[] = [];
  let inList = false;
  let inSection = false;
  let inHeader = false;

  const closeList = () => {
    if (!inList) return;
    html.push("    </ul>");
    inList = false;
  };
  const closeHeader = () => {
    if (!inHeader) return;
    html.push("    </header>");
    inHeader = false;
  };
  const closeSection = () => {
    closeList();
    if (!inSection) return;
    html.push("    </section>");
    inSection = false;
  };

  for (const rawLine of markdown.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) {
      closeSection();
      closeHeader();
      html.push("    <header class=\"cv-header\">");
      html.push(`      <h1>${escapeHtml(line.slice(2))}</h1>`);
      inHeader = true;
      continue;
    }
    if (line.startsWith("## ")) {
      closeHeader();
      closeSection();
      html.push("    <section class=\"cv-section\">");
      html.push(`      <h2>${escapeHtml(line.slice(3))}</h2>`);
      inSection = true;
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      html.push("      <div class=\"cv-role\">");
      html.push(`        <h3>${escapeHtml(line.slice(4))}</h3>`);
      html.push("      </div>");
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("      <ul>");
        inList = true;
      }
      html.push(`        <li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    if (inHeader) {
      html.push(`      <p class="contact-row">${escapeHtml(line)}</p>`);
      closeHeader();
      continue;
    }
    html.push(`      <p>${escapeHtml(line)}</p>`);
  }

  closeHeader();
  closeSection();
  return html.join("\n");
}

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const rawLine of markdown.split(/\r\n|\n|\r/)) {
    const line = normalizeCvTextForAts(rawLine.trim());
    if (!line) continue;

    if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.slice(2),
              bold: true,
              size: 32,
              font: "Arial"
            })
          ],
          spacing: { after: 140 }
        })
      );
      continue;
    }

    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.slice(3).toUpperCase(),
              bold: true,
              color: "1D6F7A",
              size: 22,
              font: "Arial"
            })
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 160, after: 80 }
        })
      );
      continue;
    }

    if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.slice(4),
              bold: true,
              size: 21,
              font: "Arial"
            })
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 120, after: 40 }
        })
      );
      continue;
    }

    if (line.startsWith("- ")) {
      paragraphs.push(
        new Paragraph({
          children: [cvTextRun(line.slice(2))],
          bullet: { level: 0 },
          spacing: { after: 40 }
        })
      );
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: [cvTextRun(line)],
        spacing: { after: 80 }
      })
    );
  }

  return paragraphs;
}

function cvTextRun(text: string): ParagraphChild {
  return new TextRun({
    text,
    size: 21,
    font: "Arial"
  });
}

function normalizeCvTextForAts(value: string): string {
  return value
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s*\u2192\s*/g, " to ")
    .replace(/\s*\u2190\s*/g, " from ")
    .replace(/\s*[\u2191\u2193]\s*/g, " ")
    .replace(/\s*\u00B7\s*/g, " | ")
    .replace(/\s*\u2022\s*/g, " | ")
    .replace(/\u20B9/g, "Rs ")
    .replace(/\u20AC/g, "EUR ")
    .replace(/\u00A3/g, "GBP ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = normalizeText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function uniqueSimilarValues(values: string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    const cleanValue = value.trim();
    if (!cleanValue) continue;
    if (unique.some((existing) => valuesAreSimilar(existing, cleanValue))) continue;
    unique.push(cleanValue);
  }
  return unique;
}

function valuesAreSimilar(left: string, right: string): boolean {
  const leftText = normalizeText(left);
  const rightText = normalizeText(right);
  if (!leftText || !rightText) return false;
  if (leftText === rightText) return true;
  if (leftText.length > 40 && rightText.length > 40 && (leftText.includes(rightText) || rightText.includes(leftText))) {
    return true;
  }

  const leftTokens = uniqueValues(significantTokens(leftText)).filter((token) => token.length > 2);
  const rightTokens = uniqueValues(significantTokens(rightText)).filter((token) => token.length > 2);
  if (leftTokens.length < 5 || rightTokens.length < 5) return false;
  if (leadTokensAreSimilar(leftTokens, rightTokens)) return true;

  const rightSet = new Set(rightTokens);
  const common = leftTokens.filter((token) => rightSet.has(token)).length;
  const overlap = common / Math.min(leftTokens.length, rightTokens.length);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = common / union;
  return overlap >= 0.75 || jaccard >= 0.62;
}

function leadTokensAreSimilar(leftTokens: string[], rightTokens: string[]): boolean {
  const leftLead = semanticLeadTokens(leftTokens);
  const rightLead = semanticLeadTokens(rightTokens);
  if (leftLead.length < 8 || rightLead.length < 8) return false;
  const rightSet = new Set(rightLead);
  const common = leftLead.filter((token) => rightSet.has(token)).length;
  return common / Math.min(leftLead.length, rightLead.length) >= 0.8;
}

function semanticLeadTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !/\d/.test(token)).slice(0, 10);
}

function uniqueProofItems(values: ProofItem[]): ProofItem[] {
  const seen = new Set<string>();
  const unique: ProofItem[] = [];
  for (const value of values) {
    if (seen.has(value.id)) continue;
    seen.add(value.id);
    unique.push(value);
  }
  return unique;
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 80);
}
