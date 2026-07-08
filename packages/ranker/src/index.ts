import MiniSearch from "minisearch";
import type {
  ExperienceRange,
  GateResult,
  JobRecord,
  PendingQuestion,
  RankedJob,
  RankComponent,
  RelaxStep,
  Seniority,
  UserProfile
} from "@applycue/core";

export interface RankedCandidateList<TId extends string = string> {
  id: string;
  items: readonly TId[];
  weight?: number;
}

export interface FusedRankContribution {
  contribution: number;
  listId: string;
  rank: number;
}

export interface FusedRankedCandidate<TId extends string = string> {
  id: TId;
  score: number;
  contributions: FusedRankContribution[];
}

export interface ReciprocalRankFusionOptions {
  limit?: number;
  rankConstant?: number;
}

export interface AmbiguityPromptOptions {
  createdAt?: string;
  limit?: number;
}

interface LexicalJobDocument {
  id: string;
  title: string;
  company: string;
  description: string;
  location: string;
  sourceName: string;
}

export function fuseRankedLists<TId extends string>(
  lists: readonly RankedCandidateList<TId>[],
  options: ReciprocalRankFusionOptions = {}
): FusedRankedCandidate<TId>[] {
  const rankConstant = options.rankConstant ?? 60;
  if (rankConstant <= 0) throw new Error("rankConstant must be greater than zero.");

  const fused = new Map<TId, FusedRankedCandidate<TId>>();
  for (const list of lists) {
    const weight = list.weight ?? 1;
    if (weight <= 0) continue;
    const seenInList = new Set<TId>();

    list.items.forEach((id, index) => {
      if (seenInList.has(id)) return;
      seenInList.add(id);
      const rank = index + 1;
      const contribution = roundFusionScore(weight / (rankConstant + rank));
      const existing = fused.get(id) ?? {
        id,
        score: 0,
        contributions: []
      };
      existing.score = roundFusionScore(existing.score + contribution);
      existing.contributions.push({
        contribution,
        listId: list.id,
        rank
      });
      fused.set(id, existing);
    });
  }

  const sorted = [...fused.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return bestRank(left) - bestRank(right) || left.id.localeCompare(right.id);
  });

  return typeof options.limit === "number" ? sorted.slice(0, options.limit) : sorted;
}

export function rankJobs(jobs: readonly JobRecord[], profile: UserProfile): RankedJob[] {
  const ranked = jobs.map((job) => rankJob(job, profile));
  const fusedByJobId = new Map(
    fuseRankedLists([
      {
        id: "backend-priority",
        items: rankedBy(ranked, (item) => item.priority).map((item) => item.job.id),
        weight: 1.5
      },
      {
        id: "role-fit",
        items: rankedBy(ranked, (item) => componentScore(item, "role-objective-fit")).map((item) => item.job.id),
        weight: 1.25
      },
      {
        id: "proof-fit",
        items: rankedBy(ranked, (item) => componentScore(item, "proof-strength")).map((item) => item.job.id),
        weight: 1
      },
      {
        id: "lexical-retrieval",
        items: rankedByLexicalRetrieval(jobs, profile),
        weight: 0.75
      },
      {
        id: "source-confidence",
        items: rankedBy(ranked, (item) => componentScore(item, "source-confidence")).map((item) => item.job.id),
        weight: 0.35
      },
      {
        id: "recency",
        items: rankedBy(ranked, (item) => discoveredAtScore(item.job)).map((item) => item.job.id),
        weight: 0.25
      }
    ]).map((item) => [item.id, item])
  );

  return [...ranked].sort((left, right) => {
    const decisionDelta = decisionRank(left) - decisionRank(right);
    if (decisionDelta !== 0) return decisionDelta;
    const fusionDelta = (fusedByJobId.get(right.job.id)?.score ?? 0) - (fusedByJobId.get(left.job.id)?.score ?? 0);
    if (fusionDelta !== 0) return fusionDelta;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.job.id.localeCompare(right.job.id);
  });
}

export function buildAmbiguityPrompts(
  rankedJobs: readonly RankedJob[],
  profile: UserProfile,
  options: AmbiguityPromptOptions = {}
): PendingQuestion[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 5));
  if (limit === 0) return [];

  const createdAt = options.createdAt ?? new Date().toISOString();
  const prompts: PendingQuestion[] = [];
  const seen = new Set<string>();

  for (const rankedJob of rankedJobs) {
    if (prompts.length >= limit) break;
    if (!gatePassed(rankedJob, "role-family")) continue;
    if (componentScore(rankedJob, "role-objective-fit") < 0.5) continue;

    const prompt = buildAmbiguityPromptForJob(rankedJob, profile, createdAt);
    if (!prompt || seen.has(prompt.id)) continue;
    seen.add(prompt.id);
    prompts.push(prompt);
  }

  return prompts;
}

export function evaluateHardGates(job: JobRecord, profile: UserProfile): GateResult[] {
  const prefs = profile.preferences;
  const jobLocation = job.location;
  const haystack = `${job.company} ${job.title} ${job.description}`.toLowerCase();
  const roleObjectiveFit = roleScore(job, profile);
  const roleFamilyOk = roleObjectiveFit >= 0.5;
  const effectiveSeniority = resolveEffectiveSeniority(job, profile, roleObjectiveFit);
  const blockedCompany = prefs.blockedCompanyNames.some((company) =>
    job.company.toLowerCase().includes(company.toLowerCase())
  );
  const sourceKindOk =
    profile.applySettings.allowedSourceKinds.length === 0 ||
    profile.applySettings.allowedSourceKinds.includes(job.source.kind);
  const currentCompany =
    Boolean(profile.currentCompany) &&
    job.company.toLowerCase().includes(profile.currentCompany!.toLowerCase());
  const pastEmployer =
    profile.applyToPastEmployers === false &&
    profile.pastEmployers.some((item) => job.company.toLowerCase().includes(item.company.toLowerCase()));
  const noGoRole = prefs.noGoRoleTerms.some((term) => haystack.includes(term.toLowerCase()));
  const excludedIndustry = prefs.excludedIndustries.some((term) => haystack.includes(term.toLowerCase()));
  const excludedKeyword = prefs.excludedKeywords.some((term) => haystack.includes(term.toLowerCase()));
  const blockedPortal = portalMatches(job, profile.sourceSettings.blockedPortals);
  const fraudSignal = findFraudSignal(searchableJobText(job), profile.sourceSettings.fraudSignalTerms);
  const portalPolicyOk = profile.sourceSettings.defaultPortalApplyPolicy !== "block" || portalMatches(job, profile.sourceSettings.trustedPortals);
  const workModeOk = prefs.acceptableWorkModes.includes(job.workMode) || job.workMode === "unknown";
  const remoteOk = !prefs.remoteOnly || job.workMode === "remote" || job.workMode === "unknown";
  const seniorityOk =
    !effectiveSeniority.value ||
    effectiveSeniority.value === "unknown" ||
    prefs.acceptableSeniorities.length === 0 ||
    prefs.acceptableSeniorities.includes(effectiveSeniority.value);
  const experienceOk = experienceRangeOk(job.requiredExperienceYears, profile);
  const employmentTypeOk =
    !job.employmentType ||
    job.employmentType === "unknown" ||
    prefs.employmentTypes.length === 0 ||
    prefs.employmentTypes.includes(job.employmentType);
  const companyStageOk =
    !job.companyStage ||
    job.companyStage === "unknown" ||
    prefs.companyStages.length === 0 ||
    prefs.companyStages.some((stage) => companyStageMatchesPreference(job.companyStage!, stage));
  const workAuthOk =
    prefs.workAuthorizationCountries.length === 0 ||
    !jobLocation ||
    prefs.workAuthorizationCountries.some((country) => locationMatchesCountry(jobLocation, country)) ||
    (job.workMode === "remote" && remoteLocationCouldIncludeAuthorizedCountry(jobLocation, prefs.workAuthorizationCountries));
  const compensationOk = compensationGate(job, profile);
  const sponsorshipOk = visaSponsorshipGate(job, profile);
  const shiftOk = shiftGate(job, profile);
  const travelOk = travelGate(job, profile);
  const timezoneOk = timezoneGate(job, profile);

  return [
    {
      id: "live",
      passed: job.liveState !== "closed",
      reason: job.liveState === "closed" ? "Job appears closed." : "Job is not known to be closed."
    },
    {
      id: "source-kind",
      passed: sourceKindOk,
      reason: sourceKindOk
        ? "Source kind is allowed by apply settings."
        : `Source kind ${job.source.kind} is not allowed by apply settings.`
    },
    {
      id: "blocked-company",
      passed: !blockedCompany && !currentCompany && !pastEmployer,
      reason: blockedCompany
        ? "Company is blocked by user preference."
        : currentCompany
          ? "Company is the user's current employer."
          : pastEmployer
            ? "Company is a past employer and user has not allowed applying there."
        : "Company is not blocked."
    },
    {
      id: "blocked-portal",
      passed: !blockedPortal,
      reason: blockedPortal ? "Portal or source is blocked by user preference." : "Portal is not blocked."
    },
    {
      id: "fraud-signal",
      passed: !fraudSignal,
      reason: fraudSignal ? `Job/source matched fraud signal: ${fraudSignal}.` : "No configured fraud signal matched."
    },
    {
      id: "portal-policy",
      passed: portalPolicyOk,
      reason: portalPolicyOk
        ? "Portal policy does not block this source."
        : "Default portal policy blocks sources unless explicitly trusted."
    },
    {
      id: "no-go-role",
      passed: !noGoRole,
      reason: noGoRole ? "Role matches a user-defined no-go term." : "No no-go role term matched."
    },
    {
      id: "role-family",
      passed: roleFamilyOk,
      reason: roleFamilyOk
        ? "Title matches the target role family."
        : "Role family does not match the target role terms strongly enough."
    },
    {
      id: "excluded-industry",
      passed: !excludedIndustry,
      reason: excludedIndustry ? "Role matches an excluded industry." : "No excluded industry matched."
    },
    {
      id: "excluded-keyword",
      passed: !excludedKeyword,
      reason: excludedKeyword ? "Role contains an excluded keyword." : "No excluded keyword matched."
    },
    {
      id: "work-mode",
      passed: workModeOk && remoteOk,
      reason: workModeOk && remoteOk ? "Work mode is acceptable." : "Work mode conflicts with preferences."
    },
    {
      id: "seniority",
      passed: seniorityOk,
      reason: seniorityGateReason(seniorityOk, effectiveSeniority, prefs.acceptableSeniorities)
    },
    {
      id: "experience",
      passed: experienceOk.passed,
      reason: experienceOk.reason
    },
    {
      id: "employment-type",
      passed: employmentTypeOk,
      reason: employmentTypeOk ? "Employment type is acceptable." : "Employment type conflicts with preferences."
    },
    {
      id: "company-stage",
      passed: companyStageOk,
      reason: companyStageOk ? "Company stage is acceptable." : "Company stage conflicts with preferences."
    },
    {
      id: "work-authorization",
      passed: workAuthOk,
      reason: workAuthOk ? "Work authorization does not block this role." : "Location may conflict with work authorization."
    },
    {
      id: "visa-sponsorship",
      passed: sponsorshipOk.passed,
      reason: sponsorshipOk.reason
    },
    {
      id: "compensation",
      passed: compensationOk.passed,
      reason: compensationOk.reason
    },
    {
      id: "shift",
      passed: shiftOk.passed,
      reason: shiftOk.reason
    },
    {
      id: "travel",
      passed: travelOk.passed,
      reason: travelOk.reason
    },
    {
      id: "timezone",
      passed: timezoneOk.passed,
      reason: timezoneOk.reason
    }
  ];
}

export function rankJob(job: JobRecord, profile: UserProfile): RankedJob {
  const gates = evaluateHardGates(job, profile);
  const gatePass = gates.every((gate) => gate.passed);
  const components = scoreComponents(job, profile);
  const weighted = weightedPriority(components);
  const priority = gatePass ? capPriorityByRoleFit(weighted, components) : 0;
  const canAutoApply =
    profile.applySettings.mode !== "review" &&
    priority >= profile.applySettings.minimumFitToApply;
  const reviewFloor = Math.max(0.5, profile.matchSettings.minimumFitFloor);
  const decision = canAutoApply
    ? "apply"
    : priority >= reviewFloor
      ? "review"
      : priority > 0
        ? "watch"
        : "skip";

  const positiveReasons = components
    .filter((component) => component.score >= 0.5)
    .slice(0, 3)
    .map((component) => component.reason);
  const gateReasons = gates
    .filter((gate) => !gate.passed)
    .slice(0, 2)
    .map((gate) => `Blocked: ${gate.reason}`);

  return {
    job,
    decision,
    priority,
    gates,
    components,
    reasons: gateReasons.length > 0 ? [...gateReasons, ...positiveReasons.slice(0, 1)] : positiveReasons,
    nextStep: decision
  };
}

export function buildRelaxPlan(profile: UserProfile, qualifiedCount: number): RelaxStep[] {
  if (qualifiedCount >= profile.matchSettings.widenIfFewerThan) return [];

  return profile.matchSettings.relaxOrder.map((area) => {
    switch (area) {
      case "source":
        return {
          area,
          action: "Scan more approved sources before changing the match.",
          needsUserReview: false
        };
      case "title":
        return {
          area,
          action: profile.matchSettings.allowAdjacentTitles
            ? "Include adjacent role titles that still match the user's target work."
            : "Ask before adding adjacent role titles.",
          needsUserReview: !profile.matchSettings.allowAdjacentTitles
        };
      case "industry":
        return {
          area,
          action: profile.matchSettings.allowAdjacentIndustries
            ? "Include adjacent industries while keeping blocked companies out."
            : "Ask before adding adjacent industries.",
          needsUserReview: !profile.matchSettings.allowAdjacentIndustries
        };
      case "location":
        return {
          area,
          action: "Add extra locations first; ask before relocation or locations marked ask-before.",
          needsUserReview: profile.preferences.askBeforeLocations.length > 0 || profile.preferences.allowRelocation !== true
        };
      case "work_mode":
        return {
          area,
          action: "Widen work mode only inside acceptable work modes.",
          needsUserReview: Boolean(profile.preferences.remoteOnly)
        };
      case "recency":
        return {
          area,
          action: "Look back further in time for still-live roles.",
          needsUserReview: false
        };
      case "minimum_fit":
        return {
          area,
          action: `Lower minimum fit down to ${profile.matchSettings.minimumFitFloor}, but never below the user's floor.`,
          needsUserReview: false
        };
    }
  });
}

function scoreComponents(job: JobRecord, profile: UserProfile): RankComponent[] {
  const jobText = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  const roleObjectiveFit = roleScore(job, profile);
  const industryFit = alternativeTermScore(jobText, profile.preferences.targetIndustries);
  const companyFit = companyScore(job, profile);
  const keywordFit = termCoverage(jobText, [
    ...profile.preferences.requiredKeywords,
    ...profile.preferences.niceToHaveKeywords
  ]);
  const proofStrength = proofCoverage(jobText, profile);
  const locationFit = locationScore(job, profile);
  const sourceConfidence = job.source.kind === "manual" ? 0.7 : job.source.kind === "unknown" ? 0.4 : 0.8;

  return [
    {
      id: "role-objective-fit",
      score: roleObjectiveFit,
      reason: roleObjectiveFit > 0 ? "Role title or description matches target role terms." : "Target role terms did not match strongly."
    },
    {
      id: "industry-fit",
      score: industryFit,
      reason: industryFit > 0 ? "Role matches target industry terms." : "Industry fit is not obvious from the job text."
    },
    {
      id: "company-fit",
      score: companyFit,
      reason: companyFit > 0.5 ? "Company matches preferred company or stage settings." : "Company is not a named preferred target."
    },
    {
      id: "keyword-fit",
      score: keywordFit,
      reason: keywordFit > 0.5 ? "Role includes preferred keywords." : "Preferred keyword match is limited."
    },
    {
      id: "proof-strength",
      score: proofStrength,
      reason: proofStrength > 0 ? "Profile proof bank has evidence related to this role." : "No strong proof-bank match found yet."
    },
    {
      id: "location-fit",
      score: locationFit,
      reason: locationFit > 0.5 ? "Location or work mode fits preferences." : "Location fit needs review."
    },
    {
      id: "source-confidence",
      score: sourceConfidence,
      reason: "Source confidence is based on source type until richer verification exists."
    }
  ];
}

function capPriorityByRoleFit(weighted: number, components: RankComponent[]): number {
  const roleFit = components.find((component) => component.id === "role-objective-fit")?.score ?? 0;
  if (roleFit < 0.5) return roundScore(Math.min(weighted, 0.49));
  if (roleFit < 0.7) return roundScore(Math.min(weighted, 0.69));
  return roundScore(weighted);
}

function weightedPriority(components: RankComponent[]): number {
  const weights: Record<string, number> = {
    "role-objective-fit": 0.46,
    "industry-fit": 0.08,
    "company-fit": 0.05,
    "keyword-fit": 0.1,
    "proof-strength": 0.16,
    "location-fit": 0.1,
    "source-confidence": 0.05
  };
  const totalWeight = components.reduce((sum, component) => sum + (weights[component.id] ?? 0), 0);
  if (totalWeight <= 0) return 0;
  return components.reduce((sum, component) => sum + component.score * (weights[component.id] ?? 0), 0) / totalWeight;
}

function rankedBy(ranked: RankedJob[], score: (item: RankedJob) => number): RankedJob[] {
  return [...ranked].sort((left, right) => {
    const scoreDelta = score(right) - score(left);
    if (scoreDelta !== 0) return scoreDelta;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.job.id.localeCompare(right.job.id);
  });
}

function rankedByLexicalRetrieval(jobs: readonly JobRecord[], profile: UserProfile): string[] {
  const query = buildLexicalRetrievalQuery(profile);
  if (jobs.length === 0 || !query) return [];

  const index = new MiniSearch<LexicalJobDocument>({
    idField: "id",
    fields: ["title", "description", "company", "location", "sourceName"],
    storeFields: ["id"]
  });
  index.addAll(jobs.map(toLexicalJobDocument));

  return index
    .search(query, {
      boost: {
        title: 4,
        description: 1.5,
        company: 0.4,
        location: 0.3,
        sourceName: 0.2
      },
      combineWith: "OR",
      fuzzy: 0.15,
      prefix: true
    })
    .map((result) => String(result.id));
}

function buildLexicalRetrievalQuery(profile: UserProfile): string {
  return uniqueNormalizedTerms([
    ...profile.preferences.targetRoleTerms,
    ...profile.preferences.targetIndustries,
    ...profile.preferences.requiredKeywords,
    ...profile.preferences.niceToHaveKeywords,
    ...profile.proofBank.flatMap((proof) => proof.tags)
  ]).join(" ");
}

function toLexicalJobDocument(job: JobRecord): LexicalJobDocument {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    description: job.description,
    location: job.location ?? "",
    sourceName: job.source.name
  };
}

function componentScore(rankedJob: RankedJob, componentId: string): number {
  return rankedJob.components.find((component) => component.id === componentId)?.score ?? 0;
}

function discoveredAtScore(job: JobRecord): number {
  const timestamp = Date.parse(job.discoveredAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildAmbiguityPromptForJob(
  rankedJob: RankedJob,
  profile: UserProfile,
  createdAt: string
): PendingQuestion | undefined {
  const failedGateIds = new Set(rankedJob.gates.filter((gate) => !gate.passed).map((gate) => gate.id));
  const job = rankedJob.job;
  const baseReason = `${job.company} - ${job.title} matched the role family, but a reusable policy gate is ambiguous.`;

  if (failedGateIds.has("seniority") && isPotentialCompanyGradeAmbiguity(job, profile)) {
    return {
      id: ambiguityQuestionId("seniority", job),
      question: `Should ${job.title} at ${job.company} count as one of your target seniority levels for future decisions, or should similar titles stay blocked?`,
      reason: `${baseReason} Company title ladders can differ by employer size, so this should become a saved preference if you approve it.`,
      blocksPipeline: false,
      createdAt
    };
  }

  if (failedGateIds.has("work-authorization")) {
    const locationTarget = locationPolicyTarget(job.location);
    if (!locationTarget) return undefined;
    return {
      id: policyQuestionId("work-authorization", locationTarget),
      question: `Should roles in ${locationTarget} be allowed for your future searches and applications?`,
      reason: `${baseReason} Location or work authorization needs an approved rule before the agent widens this area.`,
      blocksPipeline: false,
      createdAt
    };
  }

  if (failedGateIds.has("work-mode")) {
    return {
      id: policyQuestionId("work-mode", job.workMode),
      question: `Should ${job.workMode} roles like ${job.title} at ${job.company} be allowed for future applications?`,
      reason: `${baseReason} Work mode is a user preference and should be stored before the agent changes it.`,
      blocksPipeline: false,
      createdAt
    };
  }

  if (failedGateIds.has("employment-type") && job.employmentType && job.employmentType !== "unknown") {
    return {
      id: policyQuestionId("employment-type", job.employmentType),
      question: `Should ${job.employmentType.replaceAll("_", " ")} roles be included for this search?`,
      reason: `${baseReason} Employment type is currently outside the saved preference set.`,
      blocksPipeline: false,
      createdAt
    };
  }

  if (failedGateIds.has("company-stage") && job.companyStage && job.companyStage !== "unknown") {
    return {
      id: policyQuestionId("company-stage", job.companyStage),
      question: `Should ${job.companyStage.replaceAll("_", " ")} companies like ${job.company} be included for future decisions?`,
      reason: `${baseReason} Company stage is currently outside the saved preference set.`,
      blocksPipeline: false,
      createdAt
    };
  }

  return undefined;
}

function gatePassed(rankedJob: RankedJob, gateId: string): boolean {
  return rankedJob.gates.find((gate) => gate.id === gateId)?.passed === true;
}

function isPotentialCompanyGradeAmbiguity(job: JobRecord, profile: UserProfile): boolean {
  const preferredHigherSeniority = profile.preferences.acceptableSeniorities.some((seniority) =>
    ["director", "vp", "c_level", "founder"].includes(seniority)
  );
  const titleMayBeUnderstated = Boolean(job.seniority && ["manager", "senior", "lead"].includes(job.seniority));
  const companyMayLiftSeniority = job.companyMarketGrade === "global_enterprise" || job.companyMarketGrade === "enterprise";
  return preferredHigherSeniority && titleMayBeUnderstated && companyMayLiftSeniority;
}

function ambiguityQuestionId(kind: string, job: JobRecord): string {
  return `question-${slugifyIdentifier(`${kind}-${job.source.id}-${job.company}-${job.title}-${job.location ?? ""}`)}`;
}

function policyQuestionId(kind: string, value: string): string {
  return `question-${slugifyIdentifier(`${kind}-${value}`)}`;
}

function locationPolicyTarget(location: string | undefined): string | undefined {
  if (!location) return undefined;
  const cleaned = normalizeWhitespace(location.replace(/[\u00b7|]/g, ",").replace(/,+/g, ","));
  const normalized = cleaned.toLowerCase();
  if (!normalized) return undefined;
  if (["remote", "flexible remote", "flexible / remote", "worldwide", "anywhere"].includes(normalized)) {
    return undefined;
  }
  return cleaned.length > 96 ? `${cleaned.slice(0, 93)}...` : cleaned;
}

function uniqueNormalizedTerms(values: readonly string[]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
  }
  return terms;
}

function slugifyIdentifier(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 96) || "unknown";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*/g, ", ").trim();
}

function decisionRank(rankedJob: RankedJob): number {
  switch (rankedJob.decision) {
    case "apply":
      return 0;
    case "review":
      return 1;
    case "watch":
      return 2;
    case "skip":
      return 3;
  }
}

function termCoverage(text: string, terms: string[]): number {
  if (terms.length === 0) return 0.5;
  const matches = terms.filter((term) => text.includes(term.toLowerCase())).length;
  return roundScore(matches / terms.length);
}

function roleScore(job: JobRecord, profile: UserProfile): number {
  const title = job.title;
  const fullText = `${job.title} ${job.company} ${job.description}`;
  const targetScore = roleTermScore(title, fullText, profile.preferences.targetRoleTerms);
  const targetTitleScore = roleTermScore(title, title, profile.preferences.targetRoleTerms);
  const adjacentScore = profile.matchSettings.allowAdjacentTitles
    ? roleTermScore(title, fullText, profile.preferences.adjacentRoleTerms) * 0.75
    : 0;
  const adjacentTitleScore = profile.matchSettings.allowAdjacentTitles
    ? roleTermScore(title, title, profile.preferences.adjacentRoleTerms) * 0.75
    : 0;
  const targetAnchors = roleAnchorTokens(profile.preferences.targetRoleTerms);
  const allAnchors = roleAnchorTokens([...profile.preferences.targetRoleTerms, ...profile.preferences.adjacentRoleTerms]);
  const titleTokens = tokenSet(title);
  const titleHasTargetAnchor = targetAnchors.length === 0 || targetAnchors.some((token) => titleTokens.has(token));
  const titleHasAnyAnchor = allAnchors.length === 0 || allAnchors.some((token) => titleTokens.has(token));
  const untargetedAdjacentTitle = hasUntargetedAdjacentTitle(title, profile);
  const seniorRoleVariantScore = seniorityRoleVariantScore(title, profile);

  if (targetTitleScore >= 0.7 && !untargetedAdjacentTitle) return roundScore(Math.max(targetScore, adjacentScore));

  const descriptionOnlyTargetScore = titleHasTargetAnchor ? targetScore : Math.min(targetScore, 0.49);
  if (seniorRoleVariantScore >= 0.7 && !untargetedAdjacentTitle) {
    return roundScore(Math.max(descriptionOnlyTargetScore, seniorRoleVariantScore));
  }
  if (adjacentTitleScore >= 0.7) {
    const adjacentOnlyCap = titleHasTargetAnchor ? adjacentScore : Math.min(adjacentScore, 0.49);
    return roundScore(Math.max(descriptionOnlyTargetScore, adjacentOnlyCap));
  }

  const adjacentDescriptionScore = titleHasTargetAnchor ? adjacentScore : Math.min(adjacentScore, 0.49);
  const score = Math.max(descriptionOnlyTargetScore, adjacentDescriptionScore);
  const titleAnchoredScore = titleHasAnyAnchor ? score : Math.min(score, 0.4);
  if (untargetedAdjacentTitle) {
    return roundScore(Math.min(titleAnchoredScore, 0.49));
  }
  if (isTechnicalProductTitleForProductLeadership(title, profile)) {
    return roundScore(Math.min(titleAnchoredScore, 0.49));
  }
  return roundScore(titleAnchoredScore);
}

function seniorityRoleVariantScore(title: string, profile: UserProfile): number {
  const titleTokens = tokenSet(title);
  const targetAnchors = roleAnchorTokens(profile.preferences.targetRoleTerms);
  if (targetAnchors.length === 0 || !targetAnchors.some((token) => titleTokens.has(token))) return 0;
  if (isBlockedSeniorRoleVariantTitle(title, profile)) return 0;
  const acceptedSeniorities = new Set([
    ...profile.preferences.targetSeniorities,
    ...profile.preferences.acceptableSeniorities
  ]);
  if (acceptedSeniorities.has("vp") && hasAnyToken(titleTokens, ["vp"])) return 0.85;
  if (acceptedSeniorities.has("vp") && hasTokens(titleTokens, ["vice", "president"])) return 0.85;
  if (acceptedSeniorities.has("director") && hasAnyToken(titleTokens, ["director"])) return 0.8;
  if (acceptedSeniorities.has("c_level") && hasAnyToken(titleTokens, ["chief", "cpo", "cxo"])) return 0.82;
  if (acceptedSeniorities.has("founder") && hasAnyToken(titleTokens, ["founder"])) return 0.78;
  return 0;
}

function isBlockedSeniorRoleVariantTitle(title: string, profile: UserProfile): boolean {
  const normalizedTitle = normalizeText(title);
  const explicitNoGo = [
    ...profile.preferences.noGoRoleTerms,
    ...profile.preferences.excludedKeywords,
    ...profile.preferences.adjacentRoleTerms
  ]
    .map((term) => normalizeText(term))
    .filter(Boolean);
  if (explicitNoGo.some((term) => normalizedTitle.includes(term))) return true;

  const targetText = normalizeText(profile.preferences.targetRoleTerms.join(" "));
  if (!targetText.includes("product")) return false;
  const blockedProductAdjacentTokens = ["marketing", "sales", "business", "development", "engineer", "engineering", "data", "support"];
  const titleTokens = tokenSet(normalizedTitle);
  return blockedProductAdjacentTokens.some((token) => titleTokens.has(token));
}

function hasUntargetedAdjacentTitle(title: string, profile: UserProfile): boolean {
  const targetTerms = new Set(profile.preferences.targetRoleTerms.map((term) => normalizeText(term)));
  return profile.preferences.adjacentRoleTerms.some((term) => {
    const normalized = normalizeText(term);
    return normalized && !targetTerms.has(normalized) && singleTermScore(title, term) >= 0.7;
  });
}

function roleTermScore(title: string, fullText: string, terms: string[]): number {
  const cleanedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (cleanedTerms.length === 0) return 0.5;
  const titleScore = Math.max(...cleanedTerms.map((term) => singleTermScore(title, term)));
  const fullTextScore = Math.max(...cleanedTerms.map((term) => singleTermScore(fullText, term)));
  return roundScore(Math.max(titleScore, fullTextScore * 0.7));
}

function roleAnchorTokens(terms: string[]): string[] {
  const generic = new Set([
    "a",
    "and",
    "chief",
    "director",
    "executive",
    "head",
    "lead",
    "leader",
    "manager",
    "management",
    "of",
    "officer",
    "principal",
    "senior",
    "sr",
    "strategy",
    "the",
    "vp"
  ]);
  return [...new Set(terms.flatMap((term) => normalizeText(term).split(" ")).filter((token) => token && !generic.has(token)))];
}

function isTechnicalProductTitleForProductLeadership(title: string, profile: UserProfile): boolean {
  const targetText = normalizeText([
    ...profile.preferences.targetRoleTerms,
    ...profile.preferences.adjacentRoleTerms
  ].join(" "));
  if (!targetText.includes("product")) return false;
  const tokens = tokenSet(title);
  if (!tokens.has("product")) return false;
  const technicalTokens = ["engineer", "engineering", "developer", "architect", "software", "qa", "quality", "data"];
  if (!technicalTokens.some((token) => tokens.has(token))) return false;
  const leadershipTokens = ["manager", "management", "director", "head", "vp", "vice", "president", "chief", "owner", "lead"];
  return !leadershipTokens.some((token) => tokens.has(token));
}

function alternativeTermScore(text: string, terms: string[]): number {
  const cleanedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (cleanedTerms.length === 0) return 0.5;
  return roundScore(Math.max(...cleanedTerms.map((term) => singleTermScore(text, term))));
}

function singleTermScore(text: string, term: string): number {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return 0;
  if (normalizedText.includes(normalizedTerm)) return 1;
  const termTokens = normalizedTerm.split(" ").filter(Boolean);
  if (termTokens.length === 0) return 0;
  const textTokens = tokenSet(text);
  const matched = termTokens.filter((token) => textTokens.has(token)).length;
  return roundScore(matched / termTokens.length);
}

function proofCoverage(text: string, profile: UserProfile): number {
  if (profile.proofBank.length === 0) return 0.25;
  return roundScore(
    Math.max(...profile.proofBank.map((item) => termCoverage(text, item.tags)))
  );
}

function companyScore(job: JobRecord, profile: UserProfile): number {
  if (profile.preferences.preferredCompanyNames.some((company) => job.company.toLowerCase().includes(company.toLowerCase()))) {
    return 1;
  }
  if (job.companyStage && profile.preferences.companyStages.some((stage) => companyStageMatchesPreference(job.companyStage!, stage))) {
    return 0.8;
  }
  if (profile.preferences.preferredCompanyNames.length === 0 && !job.companyStage) return 0.5;
  return profile.preferences.preferredCompanyNames.length === 0 && profile.preferences.companyStages.length === 0 ? 0.5 : 0.25;
}

interface EffectiveSeniority {
  value?: Seniority;
  reason?: string;
}

function resolveEffectiveSeniority(job: JobRecord, profile: UserProfile, roleObjectiveFit: number): EffectiveSeniority {
  const override = findCompanySeniorityOverride(job, profile);
  if (override) {
    return {
      value: override.effectiveSeniority,
      reason: override.reason
        ? `Seniority uses user-approved company override: ${override.reason}`
        : "Seniority uses a user-approved company override."
    };
  }

  if (hasInflatedAvpTitle(job) && !hasHighCompanyGrade(job)) {
    return {
      value: "manager",
      reason: "AVP or assistant vice president title is treated as manager-level until company grade or user feedback proves otherwise."
    };
  }

  const base = job.seniority && job.seniority !== "unknown" ? job.seniority : undefined;
  if (!base) {
    return job.seniority === "unknown"
      ? { value: "unknown", reason: "Seniority is unknown, so it is not used as a hard blocker." }
      : { reason: "Seniority is unknown, so it is not used as a hard blocker." };
  }

  if (shouldUpgradeByCompanyGrade(job, base, roleObjectiveFit)) {
    return {
      value: "director",
      reason: "Large-company grade lifts this title one seniority band for review; it does not guarantee auto-apply."
    };
  }

  return {
    value: base,
    reason: job.seniorityEvidence?.reason ?? "Seniority is acceptable."
  };
}

function seniorityGateReason(passed: boolean, effective: EffectiveSeniority, acceptableSeniorities: Seniority[]): string {
  if (passed) return effective.reason ?? "Seniority is acceptable.";
  const accepted = acceptableSeniorities.length > 0 ? acceptableSeniorities.map(formatSeniority).join(", ") : "any";
  const actual = effective.value ? formatSeniority(effective.value) : "unknown";
  const evidence = effective.reason ? ` ${effective.reason}` : "";
  return `Seniority ${actual} conflicts with acceptable seniorities (${accepted}).${evidence}`;
}

function formatSeniority(value: Seniority): string {
  return value.replaceAll("_", " ");
}

function findCompanySeniorityOverride(job: JobRecord, profile: UserProfile): NonNullable<UserProfile["preferences"]["companySeniorityOverrides"]>[number] | undefined {
  const overrides = profile.preferences.companySeniorityOverrides ?? [];
  const company = normalizeText(job.company);
  const title = normalizeText(job.title);
  return overrides.find((override) => {
    const overrideCompany = normalizeText(override.company);
    if (!overrideCompany || !company.includes(overrideCompany)) return false;
    const titleTerms = override.titleTerms ?? [];
    return titleTerms.length === 0 || titleTerms.some((term) => title.includes(normalizeText(term)));
  });
}

function hasInflatedAvpTitle(job: JobRecord): boolean {
  const title = normalizeText(job.title);
  return /\bavp\b/.test(title) || title.includes("assistant vice president") || title.includes("associate vice president");
}

function shouldUpgradeByCompanyGrade(job: JobRecord, base: Seniority, roleObjectiveFit: number): boolean {
  if (roleObjectiveFit < 0.5) return false;
  if (!["manager", "senior", "lead"].includes(base)) return false;
  return hasHighCompanyGrade(job);
}

function hasHighCompanyGrade(job: JobRecord): boolean {
  return job.companyMarketGrade === "global_enterprise" ||
    job.companyMarketGrade === "enterprise" ||
    job.companyStage === "public_company" ||
    job.companyStage === "enterprise";
}

function companyStageMatchesPreference(jobStage: NonNullable<JobRecord["companyStage"]>, preferredStage: NonNullable<JobRecord["companyStage"]>): boolean {
  if (jobStage === preferredStage) return true;
  return preferredStage === "enterprise" && jobStage === "public_company";
}

interface ExperienceGateResult {
  passed: boolean;
  reason: string;
}

function experienceRangeOk(required: ExperienceRange | undefined, profile: UserProfile): ExperienceGateResult {
  if (!required) return { passed: true, reason: "Required experience range is not known." };

  const acceptable = profile.preferences.acceptableExperienceYears;
  if (acceptable) {
    if (typeof acceptable.min === "number" && typeof required.max === "number" && required.max < acceptable.min) {
      return {
        passed: false,
        reason: `Role asks for ${formatExperienceRange(required)}, below the user's acceptable experience range.`
      };
    }
    if (typeof acceptable.max === "number" && typeof required.min === "number" && required.min > acceptable.max) {
      return {
        passed: false,
        reason: `Role asks for ${formatExperienceRange(required)}, above the user's acceptable experience range.`
      };
    }
  }

  if (typeof profile.totalExperienceYears === "number" && typeof required.min === "number" && required.min > profile.totalExperienceYears + 1) {
    return {
      passed: false,
      reason: `Role asks for ${formatExperienceRange(required)}, above the user's recorded experience.`
    };
  }

  if (isSeniorTargetProfile(profile) && typeof required.max === "number" && required.max <= 2) {
    return {
      passed: false,
      reason: `Role asks for ${formatExperienceRange(required)}, which is junior for this profile.`
    };
  }

  return { passed: true, reason: "Required experience range is acceptable or not limiting." };
}

function isSeniorTargetProfile(profile: UserProfile): boolean {
  const seniorLevels = new Set<Seniority>(["senior", "lead", "manager", "director", "vp", "c_level", "founder"]);
  const levels = [
    profile.currentLevel,
    ...profile.preferences.targetSeniorities,
    ...profile.preferences.acceptableSeniorities
  ].filter((level): level is Seniority => Boolean(level));
  return levels.some((level) => seniorLevels.has(level));
}

interface PreferenceGateResult {
  passed: boolean;
  reason: string;
}

function compensationGate(job: JobRecord, profile: UserProfile): PreferenceGateResult {
  const floor = profile.preferences.minimumCompensation;
  if (typeof floor !== "number" || !Number.isFinite(floor)) {
    return { passed: true, reason: "No compensation floor is configured." };
  }
  if (!job.compensation) {
    return { passed: true, reason: "Job compensation is unknown, so it is not used as a hard blocker." };
  }
  const configuredCurrency = normalizeText(profile.preferences.compensationCurrency ?? "");
  const jobCurrency = normalizeText(job.compensation.currency ?? "");
  if (configuredCurrency && jobCurrency && configuredCurrency !== jobCurrency) {
    return { passed: true, reason: "Job compensation currency differs from the configured floor, so compensation needs review." };
  }
  if (typeof job.compensation.max === "number" && job.compensation.max < floor) {
    return {
      passed: false,
      reason: `Job compensation max ${formatMoney(job.compensation.max, job.compensation.currency)} is below configured floor ${formatMoney(floor, profile.preferences.compensationCurrency)}.`
    };
  }
  return { passed: true, reason: "Known compensation does not violate the configured floor." };
}

function visaSponsorshipGate(job: JobRecord, profile: UserProfile): PreferenceGateResult {
  if (profile.preferences.visaSponsorshipRequired !== true) {
    return { passed: true, reason: "Visa sponsorship is not marked as required." };
  }
  const text = searchableJobText(job);
  if (textContainsAny(text, [
    "no visa sponsorship",
    "unable to sponsor",
    "cannot sponsor",
    "will not sponsor",
    "sponsorship is not available",
    "must be authorized to work",
    "must have work authorization",
    "without sponsorship"
  ])) {
    return { passed: false, reason: "Job explicitly says visa sponsorship or work authorization support is not available." };
  }
  return { passed: true, reason: "No explicit no-sponsorship blocker was found." };
}

function shiftGate(job: JobRecord, profile: UserProfile): PreferenceGateResult {
  if (!profile.searchSettings.standardHoursOnly && profile.searchSettings.askBeforeShifts.length === 0) {
    return { passed: true, reason: "No shift preference is configured." };
  }
  const text = searchableJobText(job);
  const detectedShift = detectNonStandardShift(text, profile.searchSettings.askBeforeShifts);
  if (!detectedShift) return { passed: true, reason: "No non-standard shift signal was found." };
  if (profile.searchSettings.standardHoursOnly) {
    return { passed: false, reason: `Job mentions ${detectedShift} shift work, conflicting with standard-hours preference.` };
  }
  return { passed: true, reason: `Job mentions ${detectedShift} shift work, which should be reviewed before application.` };
}

function travelGate(job: JobRecord, profile: UserProfile): PreferenceGateResult {
  const maxTravel = profile.preferences.maxTravelPercent;
  if (typeof maxTravel !== "number" || !Number.isFinite(maxTravel)) {
    return { passed: true, reason: "No travel limit is configured." };
  }
  const travelPercent = inferTravelPercent(searchableJobText(job));
  if (typeof travelPercent !== "number") {
    return { passed: true, reason: "Travel requirement is unknown." };
  }
  return travelPercent <= maxTravel
    ? { passed: true, reason: `Travel requirement ${travelPercent}% is within configured limit ${maxTravel}%.` }
    : { passed: false, reason: `Travel requirement ${travelPercent}% exceeds configured limit ${maxTravel}%.` };
}

function timezoneGate(job: JobRecord, profile: UserProfile): PreferenceGateResult {
  const preferred = profile.preferences.preferredTimezones.map(normalizeTimezoneTerm).filter(Boolean);
  if (preferred.length === 0) return { passed: true, reason: "No timezone preference is configured." };
  const found = detectTimezoneTerms(searchableJobText(job));
  if (found.length === 0) return { passed: true, reason: "No explicit timezone requirement was found." };
  const matched = found.some((timezone) => preferred.includes(timezone));
  return matched
    ? { passed: true, reason: "Timezone requirement matches a preferred timezone." }
    : { passed: false, reason: `Job mentions timezone requirement (${found.join(", ")}) outside preferred timezone(s).` };
}

function portalMatches(job: JobRecord, terms: readonly string[]): boolean {
  const text = searchableSourceText(job);
  return terms.some((term) => textContainsPhrase(text, term));
}

function searchableJobText(job: JobRecord): string {
  return `${job.company} ${job.title} ${job.description} ${job.location ?? ""} ${job.source.name} ${job.source.url ?? ""} ${job.url}`;
}

function searchableSourceText(job: JobRecord): string {
  return `${job.source.id} ${job.source.name} ${job.source.url ?? ""} ${job.url}`;
}

function textContainsPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  return Boolean(normalizedPhrase) && normalizeText(text).includes(normalizedPhrase);
}

function textContainsAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => textContainsPhrase(text, phrase));
}

function findFraudSignal(text: string, terms: readonly string[]): string | undefined {
  return terms.find((term) => fraudTermMatches(text, term));
}

function fraudTermMatches(text: string, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  const normalizedText = normalizeText(text);
  if (normalizedTerm === "deposit") {
    return /\b(pay|payment|fee|registration|training|security|refundable|required|before)\b.{0,40}\bdeposit\b/.test(normalizedText) ||
      /\bdeposit\b.{0,40}\b(pay|payment|fee|registration|training|security|refundable|required|before)\b/.test(normalizedText);
  }
  if (normalizedTerm === "payment required") {
    return /\b(payment|required|pay|fee)\b.{0,40}\b(payment|required|pay|fee)\b/.test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

function detectNonStandardShift(text: string, configuredAskBefore: readonly string[]): string | undefined {
  const normalized = normalizeText(text);
  const candidates = [
    ...configuredAskBefore.map(normalizeText),
    "night shift",
    "rotational shift",
    "rotating shift",
    "weekend shift",
    "graveyard shift",
    "us shift",
    "uk shift"
  ].filter(Boolean);
  return candidates.find((candidate) => normalized.includes(candidate));
}

function inferTravelPercent(text: string): number | undefined {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const percentMatches = [...normalized.matchAll(/\b(?:up to|upto|about|around|approximately)?\s*(\d{1,3})\s*percent\s+travel\b/g)];
  const symbolMatches = [...normalized.matchAll(/\b(?:up to|upto|about|around|approximately)?\s*(\d{1,3})\s*%\s+travel\b/g)];
  const values = [...percentMatches, ...symbolMatches]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  return values.length > 0 ? Math.max(...values) : undefined;
}

function detectTimezoneTerms(text: string): string[] {
  const normalized = normalizeText(text);
  const tokens = tokenSet(normalized);
  const timezoneContext = /\b(timezone|time zone|working hours|overlap)\b/.test(normalized);
  const detected = TIMEZONE_TERMS.filter((timezone) =>
    timezone.length <= 4
      ? tokens.has(timezone)
      : normalized.includes(timezone)
  );
  return timezoneContext || detected.length > 0 ? [...new Set(detected)] : [];
}

function normalizeTimezoneTerm(value: string): string {
  return normalizeText(value).replace(/\btime\b/g, "").replace(/\s+/g, " ").trim();
}

function formatMoney(value: number, currency?: string): string {
  return `${currency?.trim() ? `${currency.trim()} ` : ""}${value}`;
}

function formatExperienceRange(range: ExperienceRange): string {
  if (typeof range.min === "number" && typeof range.max === "number") return `${range.min}-${range.max} years`;
  if (typeof range.min === "number") return `${range.min}+ years`;
  if (typeof range.max === "number") return `up to ${range.max} years`;
  return "unknown years";
}

function locationScore(job: JobRecord, profile: UserProfile): number {
  if (job.workMode === "remote") return 1;
  if (!job.location || profile.preferences.preferredLocations.length === 0) return 0.5;
  return profile.preferences.preferredLocations.some((location) => locationMatchesPreference(job.location!, location))
    ? 1
    : 0;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function roundFusionScore(value: number): number {
  return Math.max(0, Math.round(value * 10000) / 10000);
}

function bestRank(candidate: FusedRankedCandidate): number {
  return Math.min(...candidate.contributions.map((contribution) => contribution.rank));
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  india: ["in", "ind"],
  "united states": ["us", "usa", "united states of america"],
  "united kingdom": ["uk", "gb", "gbr", "great britain", "britain"],
  singapore: ["sg", "sgp"],
  germany: ["de", "deu"],
  australia: ["au", "aus"],
  "united arab emirates": ["ae", "are", "uae"]
};

const COUNTRY_LOCATION_ALIASES: Record<string, string[]> = {
  india: [
    "ahmedabad",
    "bangalore",
    "bengaluru",
    "chennai",
    "delhi",
    "delhi ncr",
    "gurgaon",
    "gurugram",
    "hyderabad",
    "mumbai",
    "noida",
    "pune",
    "karnataka",
    "maharashtra",
    "haryana",
    "gujarat",
    "uttar pradesh",
    "telangana",
    "tamil nadu",
    "ka",
    "mh",
    "hr",
    "gj",
    "up",
    "ts",
    "tn",
    "dl"
  ]
};

const TIMEZONE_TERMS = [
  "ist",
  "india standard",
  "gmt",
  "utc",
  "est",
  "eastern",
  "pst",
  "pacific",
  "cst",
  "central",
  "mst",
  "mountain",
  "cet",
  "cest",
  "bst",
  "sgt",
  "aest",
  "aedt",
  "us hours",
  "uk hours",
  "europe hours",
  "apac hours"
];

function locationMatchesCountry(location: string, country: string): boolean {
  const aliases = countryAliases(country);
  return aliases.some((alias) => textContainsAlias(location, alias));
}

function remoteLocationCouldIncludeAuthorizedCountry(location: string, countries: string[]): boolean {
  const normalized = normalizeText(location);
  if (!normalized) return true;
  if (["anywhere", "global", "worldwide"].some((term) => normalized.includes(term))) return true;
  return countries.some((country) => countryRegions(country).some((region) => normalized.includes(region)));
}

function countryRegions(country: string): string[] {
  const normalized = normalizeText(country);
  const regionsByCountry: Record<string, string[]> = {
    india: ["asia", "apac", "asia pacific"],
    singapore: ["asia", "apac", "asia pacific"],
    australia: ["apac", "asia pacific", "oceania"],
    germany: ["europe"],
    "united kingdom": ["europe"],
    "united states": ["north america", "americas"],
    "united arab emirates": ["middle east", "emea"]
  };
  return regionsByCountry[normalized] ?? [];
}

function locationMatchesPreference(location: string, preference: string): boolean {
  if (textContainsAlias(location, preference)) return true;
  return locationMatchesCountry(location, preference);
}

function countryAliases(country: string): string[] {
  const normalized = normalizeText(country);
  if (!normalized) return [];
  return [normalized, ...(COUNTRY_ALIASES[normalized] ?? []), ...(COUNTRY_LOCATION_ALIASES[normalized] ?? [])];
}

function textContainsAlias(text: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  if (normalizedAlias.length === 2) {
    return hasRegionCodeToken(text, normalizedAlias);
  }
  if (normalizedAlias.length === 3) {
    return tokenSet(text).has(normalizedAlias);
  }
  return normalizeText(text).includes(normalizedAlias);
}

function hasRegionCodeToken(text: string, code: string): boolean {
  if (code.length !== 2) return false;
  return text.split(/[^A-Za-z0-9]+/).some((token) => token === code.toUpperCase());
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

function hasAnyToken(tokens: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.has(candidate));
}

function hasTokens(tokens: Set<string>, candidates: string[]): boolean {
  return candidates.every((candidate) => tokens.has(candidate));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
