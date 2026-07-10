import type {
  AtsDiagnosticReport,
  CvVariant,
  JobRecord,
  ProgressAtsDiagnosticsSummary,
  ReconciliationReport,
  UserProfile
} from "@applycue/core";

export interface CreateAtsDiagnosticReportInput {
  checkedAt?: string;
  cvMarkdown: string;
  job: JobRecord;
  profile: UserProfile;
  reconciliationReport: ReconciliationReport;
  variant: CvVariant;
}

export function createAtsDiagnosticReport(input: CreateAtsDiagnosticReportInput): AtsDiagnosticReport {
  const sectionHeadings = extractSectionHeadings(input.cvMarkdown);
  const parseability = {
    sectionHeadings,
    hasContact: hasVisibleContact(input.cvMarkdown, input.profile),
    hasExperience: hasSection(sectionHeadings, "experience"),
    hasSkills: sectionHeadings.some((heading) => normalizeText(heading).includes("skill")),
    hasEducation: hasSection(sectionHeadings, "education"),
    bulletCount: countMarkdownBullets(input.cvMarkdown),
    wordCount: countWords(input.cvMarkdown)
  };
  const keywordCoverage = buildKeywordCoverage(input.variant, input.cvMarkdown);
  const warnings = [
    ...parseabilityWarnings(parseability, input.profile),
    ...keywordCoverageWarnings(keywordCoverage)
  ];

  return {
    id: `${input.variant.id}-ats-diagnostics`,
    cvVariantId: input.variant.id,
    jobId: input.job.id,
    status: warnings.length > 0 ? "warn" : "pass",
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    parseability,
    keywordCoverage,
    warnings,
    notes: [
      "Diagnostic only. Reconciliation remains the truth gate; this report must not become a candidate score.",
      input.reconciliationReport.status === "passed"
        ? "Reconciliation passed before this diagnostic was created."
        : `Reconciliation status was ${input.reconciliationReport.status}; do not use this diagnostic to bypass it.`
    ]
  };
}

export function summarizeAtsDiagnosticReports(reports: AtsDiagnosticReport[]): ProgressAtsDiagnosticsSummary | undefined {
  if (reports.length === 0) return undefined;
  const warningCounts = new Map<string, number>();
  for (const report of reports) {
    for (const warning of report.warnings) {
      warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1);
    }
  }
  const topWarnings = [...warningCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([warning, count]) => count > 1 ? `${warning} (${count})` : warning);

  return {
    reports: reports.length,
    passed: reports.filter((report) => report.status === "pass").length,
    warned: reports.filter((report) => report.status === "warn").length,
    warnings: reports.reduce((sum, report) => sum + report.warnings.length, 0),
    missingSupportedTerms: reports.reduce(
      (sum, report) => sum + report.keywordCoverage.missingSupportedTerms.length,
      0
    ),
    unsupportedMentions: reports.reduce(
      (sum, report) => sum + report.keywordCoverage.unsupportedMentions.length,
      0
    ),
    topWarnings
  };
}

type Parseability = AtsDiagnosticReport["parseability"];
type KeywordCoverage = AtsDiagnosticReport["keywordCoverage"];

function buildKeywordCoverage(variant: CvVariant, cvMarkdown: string): KeywordCoverage {
  const supportedMatches = variant.requirementMatches.filter((match) => match.status === "supported");
  const missingSupportedTerms = supportedMatches
    .map((match) => match.requirement)
    .filter((requirement) => !containsTerm(cvMarkdown, requirement));
  const unsupportedMentions = variant.unsupportedRequirements.filter((requirement) =>
    containsTerm(cvMarkdown, requirement)
  );

  return {
    supportedRequired: supportedMatches.length,
    exactCovered: supportedMatches.length - missingSupportedTerms.length,
    missingSupportedTerms,
    unsupportedMentions
  };
}

function parseabilityWarnings(parseability: Parseability, profile: UserProfile): string[] {
  const warnings: string[] = [];
  if (hasConfiguredContact(profile) && !parseability.hasContact) {
    warnings.push("Configured contact details are not visible in the generated CV.");
  }
  if (!parseability.hasExperience) warnings.push("Missing Experience section.");
  if (!parseability.hasSkills) warnings.push("Missing Core Skills or Skills section.");
  if (parseability.bulletCount < 12) warnings.push("Generated CV has fewer than 12 bullets.");
  if (parseability.wordCount < 350) warnings.push("Generated CV has fewer than 350 words.");
  return warnings;
}

function keywordCoverageWarnings(keywordCoverage: KeywordCoverage): string[] {
  return [
    ...keywordCoverage.missingSupportedTerms.map((requirement) =>
      `Supported JD term is not visible in the generated CV: ${requirement}.`
    ),
    ...keywordCoverage.unsupportedMentions.map((requirement) =>
      `Unsupported term appears in the generated CV: ${requirement}.`
    )
  ];
}

function extractSectionHeadings(markdown: string): string[] {
  return markdown
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function hasSection(headings: string[], section: string): boolean {
  const wanted = normalizeText(section);
  return headings.some((heading) => normalizeText(heading) === wanted);
}

function hasVisibleContact(markdown: string, profile: UserProfile): boolean {
  const configured = [
    profile.contact?.email,
    profile.contact?.phone,
    profile.contact?.location ?? profile.currentLocation,
    ...(profile.contact?.links?.map((link) => link.url) ?? [])
  ].filter((value): value is string => Boolean(value?.trim()));
  if (configured.length === 0) return true;
  const cvText = normalizeText(markdown);
  return configured.some((value) => cvText.includes(normalizeText(value)));
}

function hasConfiguredContact(profile: UserProfile): boolean {
  return Boolean(
    profile.contact?.email ||
    profile.contact?.phone ||
    profile.contact?.location ||
    profile.currentLocation ||
    (profile.contact?.links?.length ?? 0) > 0
  );
}

function containsTerm(markdown: string, term: string): boolean {
  const normalizedCv = normalizeText(markdown);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return true;
  return normalizedCv.includes(normalizedTerm);
}

function countMarkdownBullets(markdown: string): number {
  return markdown.split(/\r\n|\n|\r/).filter((line) => /^-\s+\S/.test(line)).length;
}

function countWords(markdown: string): number {
  return normalizeText(markdown).split(/\s+/).filter(Boolean).length;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
