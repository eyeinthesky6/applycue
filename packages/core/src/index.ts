export type ApplyCueId = string;

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export type JobLiveState = "live" | "closed" | "unknown";

export type ApplyDecision = "apply" | "review" | "watch" | "skip";

export type ApplyMode = "review" | "daily" | "push";

export type Seniority =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "director"
  | "vp"
  | "c_level"
  | "founder"
  | "unknown";

export type CompanyStage =
  | "startup"
  | "scaleup"
  | "mid_market"
  | "enterprise"
  | "public_company"
  | "agency"
  | "nonprofit"
  | "unknown";

export type CompanyMarketGrade =
  | "global_enterprise"
  | "enterprise"
  | "mid_market"
  | "startup"
  | "unknown";

export type SeniorityEvidenceSource =
  | "explicit"
  | "title"
  | "description"
  | "provider"
  | "user_override"
  | "company_grade";

export interface SeniorityEvidence {
  value: Seniority;
  source: SeniorityEvidenceSource;
  confidence: "low" | "medium" | "high";
  reason: string;
}

export interface ExperienceRange {
  min?: number;
  max?: number;
}

export interface CompanySeniorityOverride {
  company: string;
  titleTerms?: string[];
  effectiveSeniority: Seniority;
  reason?: string;
}

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "consulting"
  | "fractional"
  | "internship"
  | "unknown";

export type MatchRange = "tight" | "normal" | "wide";

export type RelaxArea =
  | "title"
  | "industry"
  | "location"
  | "work_mode"
  | "source"
  | "recency"
  | "minimum_fit";

export type MessagePolicy = "draft_only" | "auto_send_simple" | "pause_for_all";

export type PortalApplyPolicy = "allow" | "ask" | "block";

export type ProofKind =
  | "work"
  | "project"
  | "education"
  | "internship"
  | "volunteer"
  | "portfolio"
  | "certification"
  | "other";

export type PauseReason =
  | "missing_required_answer"
  | "sensitive_personal_data"
  | "unsupported_cv_claim"
  | "work_authorization"
  | "compensation"
  | "relocation"
  | "platform_rule"
  | "unknown_portal"
  | "fraud_signal"
  | "user_defined";

export type ApplicationStatus =
  | "found"
  | "shortlisted"
  | "cv_ready"
  | "prepared"
  | "submitted"
  | "confirmation_received"
  | "reply_received"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "archived";

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ContactProfile {
  email?: string;
  phone?: string;
  location?: string;
  links?: ProfileLink[];
}

export interface WorkHistoryItem {
  company: string;
  designation?: string;
  level?: Seniority;
  startDate?: string;
  endDate?: string;
}

export interface ProofItem {
  id: ApplyCueId;
  claim: string;
  evidence: string;
  tags: string[];
  kind?: ProofKind;
  source?: string;
}

export type FactSourceKind =
  | "base_cv"
  | "target_base_cv"
  | "user_confirmed"
  | "proof_bank"
  | "application_answer";

export type FactSensitivity = "minor" | "major";

export type FactCategory =
  | "role"
  | "company"
  | "location"
  | "industry"
  | "skill"
  | "tool"
  | "metric"
  | "education"
  | "certification"
  | "work_authorization"
  | "compensation"
  | "other";

export interface ProfileFact {
  id: ApplyCueId;
  statement: string;
  category: FactCategory;
  sourceKind: FactSourceKind;
  sensitivity: FactSensitivity;
  approvedByUser: boolean;
  sourceRef?: string;
  createdAt: string;
}

export interface ApplicationAnswer {
  id: ApplyCueId;
  field: string;
  value: string;
  approvedByUser: boolean;
  needsApproval?: boolean;
  aliases?: string[];
  sourceRef?: string;
  createdAt: string;
}

export type UserAssetKind =
  | "base_cv"
  | "profile_image"
  | "portfolio"
  | "certificate"
  | "cover_letter"
  | "application_attachment"
  | "other";

export interface UserAsset {
  id: ApplyCueId;
  label: string;
  kind: UserAssetKind;
  path: string;
  contentType?: string;
  originalPath?: string;
  contentHash?: string;
  notes?: string[];
  createdAt: string;
  updatedAt: string;
}

export type BaseCvKind = "master_cv" | "user_role_cv" | "agent_proposed_role_cv";

export type BaseCvStatus = "active" | "draft" | "archived" | "needs_review";

export interface BaseCvSource {
  id: ApplyCueId;
  label: string;
  kind: BaseCvKind;
  status: BaseCvStatus;
  version: string;
  path: string;
  roleFamilyTerms: string[];
  originalPath?: string;
  parentBaseCvId?: ApplyCueId;
  contentHash?: string;
  notes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TargetBaseCv {
  id: ApplyCueId;
  label: string;
  roleFamilyTerms?: string[];
  baseCvSourceId?: ApplyCueId;
  parentTargetBaseCvId?: ApplyCueId;
  version?: string;
  status?: BaseCvStatus;
  targetRoleTerms: string[];
  sourceCvHash?: string;
  approvedFactIds: ApplyCueId[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  targetRoleTerms: string[];
  adjacentRoleTerms: string[];
  targetIndustries: string[];
  excludedIndustries: string[];
  preferredLocations: string[];
  extraLocations: string[];
  askBeforeLocations: string[];
  acceptableWorkModes: WorkMode[];
  targetSeniorities: Seniority[];
  acceptableSeniorities: Seniority[];
  acceptableExperienceYears?: ExperienceRange;
  companySeniorityOverrides?: CompanySeniorityOverride[];
  employmentTypes: EmploymentType[];
  companyStages: CompanyStage[];
  preferredCompanyNames: string[];
  blockedCompanyNames: string[];
  noGoRoleTerms: string[];
  requiredKeywords: string[];
  niceToHaveKeywords: string[];
  excludedKeywords: string[];
  workAuthorizationCountries: string[];
  visaSponsorshipRequired?: boolean;
  noticePeriodDays?: number;
  maxTravelPercent?: number;
  preferredTimezones: string[];
  remoteOnly?: boolean;
  allowRelocation?: boolean;
  minimumCompensation?: number;
  targetCompensation?: number;
  compensationCurrency?: string;
}

export interface SearchSettings {
  searchCountries: string[];
  searchAreas: string[];
  remoteRegions: string[];
  agentMayExpandSearchArea: boolean;
  informUserOnSearchAreaChange: boolean;
  standardHoursOnly: boolean;
  preferredShifts: string[];
  askBeforeShifts: string[];
}

export interface JobBoardSearchDefaults {
  siteNames?: string[];
  countryIndeed?: string;
  resultsWanted?: number;
  hoursOld?: number;
}

export interface SourceSearchTemplate {
  id?: ApplyCueId;
  label: string;
  kind: JobSource["kind"];
  queryTemplate: string;
  priority?: number;
  provider?: string;
  reason?: string;
  requiresBrowser?: boolean;
  requiresLogin?: boolean;
}

export interface SourceSettings {
  allowLoggedInBrowserAccess: boolean;
  defaultPortalApplyPolicy: PortalApplyPolicy;
  trustedPortals: string[];
  askBeforePortals: string[];
  blockedPortals: string[];
  fraudSignalTerms: string[];
  jobBoardDefaults?: JobBoardSearchDefaults;
  searchTemplates?: SourceSearchTemplate[];
}

export interface MatchSettings {
  range: MatchRange;
  widenIfFewerThan: number;
  relaxOrder: RelaxArea[];
  minimumFitFloor: number;
  allowAdjacentTitles: boolean;
  allowAdjacentIndustries: boolean;
}

export interface ApplySettings {
  mode: ApplyMode;
  applicationsPerDay: number;
  minimumFitToApply: number;
  allowedSourceKinds: JobSource["kind"][];
  messagePolicy: MessagePolicy;
  pauseReasons: PauseReason[];
  trackEmailReplies: boolean;
  allowRecruiterDmDrafts: boolean;
}

export interface UserProfile {
  id: ApplyCueId;
  name?: string;
  headline?: string;
  contact?: ContactProfile;
  baseCvText?: string;
  activeBaseCvId?: ApplyCueId;
  baseCvSources?: BaseCvSource[];
  assets?: UserAsset[];
  currentCompany?: string;
  currentDesignation?: string;
  currentLevel?: Seniority;
  totalExperienceYears?: number;
  currentCountry?: string;
  currentLocation?: string;
  pastEmployers: WorkHistoryItem[];
  applyToPastEmployers?: boolean;
  preferences: UserPreferences;
  searchSettings: SearchSettings;
  sourceSettings: SourceSettings;
  applySettings: ApplySettings;
  matchSettings: MatchSettings;
  proofBank: ProofItem[];
  facts?: ProfileFact[];
  applicationAnswers?: ApplicationAnswer[];
  targetBaseCvs?: TargetBaseCv[];
}

export interface ProgressSnapshot {
  id: ApplyCueId;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  profileId?: ApplyCueId;
  outputRoot?: string;
  runId?: ApplyCueId;
  applications: Record<ApplicationStatus, number>;
  items: ProgressApplicationItem[];
  pendingQuestions: number;
  nextActions: string[];
  notes: string[];
  cvQuality?: ProgressCvQualitySummary;
  jobDecisions?: ProgressJobDecisionItem[];
  livePreflight?: ProgressLivePreflightSummary;
  pendingQuestionItems?: PendingQuestion[];
  scanHistory?: ProgressScanHistorySummary;
  sourceScorecards?: ProgressSourceScorecardSummary;
  sourceOutcomes?: ProgressSourceOutcomeSummary;
  sourceQuality?: ProgressSourceQualitySummary;
  funnelHealth?: ProgressFunnelHealthSummary;
}

export interface ProgressCvQualitySummary {
  generatedCvs: number;
  baseCvChars?: number;
  minimumCvChars: number;
  minimumBaseCvPercent?: number;
  minimumBullets: number;
  employerHeadings: number;
  minimumEmployerBullets: number;
}

export interface ProgressScanHistorySummary {
  historyPath?: string;
  inputJobs: number;
  keptJobs: number;
  mode: ApplyMode;
  recordedJobs: number;
  repostClusters: number;
  repostWindowDays: number;
  repostedJobs: number;
  skippedClosed: number;
  skippedJobs: number;
  skippedPrepared: number;
  topReposts: ProgressScanHistoryRepostCluster[];
}

export interface ProgressScanHistoryRepostCluster {
  company: string;
  role: string;
  appearances: number;
  firstSeenAt: string;
  lastSeenAt: string;
  daysSpan: number;
  urls: string[];
}

export interface ProgressSourceQualitySummary {
  inputJobs: number;
  keptJobs: number;
  filteredJobs: number;
  byReason: {
    title: number;
    location: number;
    content: number;
  };
}

export type ProgressFunnelHealthStatus = "healthy" | "low_volume" | "high_volume" | "noisy_sources";

export interface ProgressFunnelPressureItem {
  id: string;
  label: string;
  count: number;
  examples: string[];
}

export interface ProgressFunnelHealthSummary {
  status: ProgressFunnelHealthStatus;
  message: string;
  configuredDailyTarget: number;
  preparedApplications: number;
  discoveredJobs: number;
  keptForRanking: number;
  rankedJobs: number;
  watchOrSkippedJobs: number;
  dominantFilters: ProgressFunnelPressureItem[];
  dominantGateBlocks: ProgressFunnelPressureItem[];
  suggestedActions: string[];
}

export interface ProgressSourceScorecardSummary {
  fetchedJobs: number;
  keptJobs: number;
  filteredJobs: number;
  preparedApplications: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  positiveOutcomes: number;
  sources: ProgressSourceScorecardItem[];
}

export interface ProgressSourceScorecardItem {
  sourceId: ApplyCueId;
  sourceName: string;
  sourceKind: JobSource["kind"];
  fetchedJobs: number;
  keptJobs: number;
  filteredJobs: number;
  preparedApplications: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  positiveOutcomes: number;
  precision: number;
  yield: number;
  lastOutcomeAt?: string;
}

export interface ProgressLivePreflightSummary {
  status: "pass" | "pause" | "fail" | "skipped";
  summary: string;
  answerPromptCount: number;
  reusableAnswerPromptCount: number;
  oneOffAnswerPromptCount: number;
  questions: string[];
  selectedCompany?: string;
  selectedRoleTitle?: string;
  checkedUrl?: string;
  paths: {
    answerPromptsHtml?: string;
    answerPromptsMarkdown?: string;
    approvalTemplate?: string;
    report?: string;
  };
}

export interface ProgressSourceOutcomeSummary {
  eventPath?: string;
  trackedApplications: number;
  outcomeEvents: number;
  preparedApplications: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  positiveOutcomes: number;
  sources: ProgressSourceOutcomeItem[];
}

export interface ProgressSourceOutcomeItem {
  sourceId: ApplyCueId;
  sourceName: string;
  sourceKind: JobSource["kind"];
  trackedApplications: number;
  preparedApplications: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  positiveOutcomes: number;
  lastOutcomeAt?: string;
}

export interface ProgressApplicationItem {
  applicationId: ApplyCueId;
  jobId: ApplyCueId;
  company: string;
  title: string;
  status: ApplicationStatus;
  browserPlanPath?: string;
  browserReceiptPath?: string;
  browserReceiptStatus?: ApplicationReceipt["status"];
  cvDocxPath?: string;
  cvHtmlPath?: string;
  cvVariantId?: ApplyCueId;
  cvPath?: string;
  jdPath?: string;
  reconciliationPath?: string;
  reconciliationStatus?: ReconciliationReport["status"];
  canAutoSubmit: boolean;
  submitRequiresApproval: boolean;
  pauseReasons: PauseReason[];
  nextStep: string;
}

export interface ProgressJobDecisionItem {
  jobId: ApplyCueId;
  company: string;
  title: string;
  sourceName: string;
  location?: string;
  decision: ApplyDecision;
  reasons: string[];
  failedGates: string[];
  reconciliationStatus?: ReconciliationReport["status"];
  skippedReason?: string;
  nextStep: string;
}

export interface PendingQuestion {
  id: ApplyCueId;
  question: string;
  reason: string;
  blocksPipeline: boolean;
  createdAt: string;
}

export interface JobSource {
  id: ApplyCueId;
  kind:
    | "company_site"
    | "ats"
    | "job_board"
    | "social_post"
    | "community_post"
    | "newsletter"
    | "recruiter_message"
    | "email_alert"
    | "manual"
    | "unknown";
  name: string;
  url?: string;
}

export type SourceSuggestionOrigin = "system_generated" | "agent_suggested" | "user_added";

export type SourceSuggestionStatus = "suggested" | "approved" | "rejected" | "active" | "archived";

export interface SourceSuggestion {
  id: ApplyCueId;
  origin: SourceSuggestionOrigin;
  status: SourceSuggestionStatus;
  kind: JobSource["kind"];
  label: string;
  reason: string;
  priority: number;
  createdAt: string;
  provider?: string;
  company?: string;
  url?: string;
  query?: string;
  options?: Record<string, unknown>;
  duplicateOf?: ApplyCueId;
  requiresConfirmation: boolean;
  requiresBrowser?: boolean;
  requiresLogin?: boolean;
}

export interface SourcePlanSearchProfile {
  titleFilter: {
    positive: string[];
    negative: string[];
    seniorityBoost: string[];
  };
  locationFilter: {
    alwaysAllow: string[];
    allow: string[];
    askBefore: string[];
    block: string[];
  };
  contentFilter: {
    required: string[];
    positive: string[];
    negative: string[];
  };
  sourceHints: {
    preferredCompanies: string[];
    blockedCompanies: string[];
    trustedPortals: string[];
    askBeforePortals: string[];
    blockedPortals: string[];
    fraudSignalTerms: string[];
  };
  notes: string[];
}

export interface SourcePlan {
  id: ApplyCueId;
  profileId: ApplyCueId;
  generatedAt: string;
  status: "generated_for_review" | "approved" | "archived";
  generatedFrom: {
    targetRoleTerms: string[];
    targetIndustries: string[];
    preferredLocations: string[];
    extraLocations: string[];
    preferredCompanyNames: string[];
  };
  searchProfile: SourcePlanSearchProfile;
  suggestions: SourceSuggestion[];
  notes: string[];
}

export type ApprovedSourceBucket =
  | "searches"
  | "jobBoards"
  | "companyPages"
  | "communities"
  | "newsletters"
  | "loggedInBrowserSources";

export type ProviderCredentialKind = "env" | "local_secret_store" | "connector";

export interface ProviderCredentialRef {
  owner: "user";
  kind: ProviderCredentialKind;
  ref: string;
  provider?: string;
}

export interface ApprovedSourceConfigEntry {
  id: ApplyCueId;
  origin: SourceSuggestionOrigin;
  status: "active" | "archived";
  kind: JobSource["kind"];
  label: string;
  enabled: boolean;
  approvedAt: string;
  sourceSuggestionId?: ApplyCueId;
  sourcePlanId?: ApplyCueId;
  provider?: string;
  company?: string;
  url?: string;
  query?: string;
  requiresBrowser?: boolean;
  requiresLogin?: boolean;
  credentialRef?: ProviderCredentialRef;
  credentialRequired?: boolean;
  options?: Record<string, unknown>;
}

export interface Compensation {
  min?: number;
  max?: number;
  currency?: string;
  period?: "year" | "month" | "hour" | "unknown";
}

export interface JobRecord {
  id: ApplyCueId;
  source: JobSource;
  company: string;
  title: string;
  url: string;
  description: string;
  location?: string;
  workMode: WorkMode;
  seniority?: Seniority;
  seniorityEvidence?: SeniorityEvidence;
  companyMarketGrade?: CompanyMarketGrade;
  requiredExperienceYears?: ExperienceRange;
  employmentType?: EmploymentType;
  companyStage?: CompanyStage;
  compensation?: Compensation;
  discoveredAt: string;
  liveState: JobLiveState;
}

export interface GateResult {
  id: string;
  passed: boolean;
  reason: string;
}

export interface RankComponent {
  id: string;
  score: number;
  reason: string;
}

export interface RankedJob {
  job: JobRecord;
  decision: ApplyDecision;
  priority: number;
  gates: GateResult[];
  components: RankComponent[];
  reasons: string[];
  nextStep: "apply" | "review" | "watch" | "skip";
}

export interface RelaxStep {
  area: RelaxArea;
  action: string;
  needsUserReview: boolean;
}

export type CvFormatMode = "standard_ats_v1";

export type RequirementMatchStatus = "supported" | "adjacent" | "unsupported" | "needs_confirmation";

export interface JobRequirementMatch {
  requirementId: ApplyCueId;
  requirement: string;
  status: RequirementMatchStatus;
  proofItemIds: ApplyCueId[];
  factIds?: ApplyCueId[];
  note: string;
}

export interface JobRequirement {
  id: ApplyCueId;
  text: string;
  category: FactCategory;
  required: boolean;
  source: "job_description" | "application_form" | "user_added";
}

export interface CvChange {
  section: string;
  change: string;
  proofItemIds: ApplyCueId[];
  factIds?: ApplyCueId[];
  requiresUserApproval?: boolean;
}

export interface CvContentPlan {
  id: ApplyCueId;
  jobId: ApplyCueId;
  targetBaseCvId?: ApplyCueId;
  formatMode: CvFormatMode;
  templateId: string;
  requirements: JobRequirement[];
  requirementMatches: JobRequirementMatch[];
  changes: CvChange[];
  unsupportedRequirements: string[];
  createdAt: string;
}

export interface ReconciliationIssue {
  id: ApplyCueId;
  severity: "blocker" | "needs_confirmation" | "note";
  message: string;
  requirementId?: ApplyCueId;
  factIds: ApplyCueId[];
  proofItemIds: ApplyCueId[];
}

export interface ReconciliationReport {
  id: ApplyCueId;
  cvContentPlanId: ApplyCueId;
  status: "passed" | "needs_user_confirmation" | "blocked";
  issues: ReconciliationIssue[];
  coverage: {
    totalRequired: number;
    supported: number;
    needsConfirmation: number;
    adjacent: number;
    unsupported: number;
  };
  checkedAt: string;
}

export interface CvVariant {
  id: ApplyCueId;
  jobId: ApplyCueId;
  label: string;
  formatMode: CvFormatMode;
  templateId: string;
  sourceCvHash?: string;
  targetBaseCvId?: ApplyCueId;
  requirementMatches: JobRequirementMatch[];
  unsupportedRequirements: string[];
  reconciliationStatus: "passed" | "needs_user_confirmation" | "blocked";
  reconciliationNotes: string[];
  changes: CvChange[];
  createdAt: string;
}

export interface GeneratedFileManifest {
  id: ApplyCueId;
  kind:
    | "browser_plan_json"
    | "cv_docx"
    | "cv_markdown"
    | "cv_html"
    | "dashboard_html"
    | "job_description_markdown"
    | "reconciliation_json"
    | "run_manifest"
    | "run_summary_markdown"
    | "source_plan_json";
  path: string;
  sourceIds: ApplyCueId[];
  createdAt: string;
}

export interface ApplicationDraft {
  jobId: ApplyCueId;
  cvVariantId?: ApplyCueId;
  answers: Array<{
    field: string;
    value: string;
    needsApproval: boolean;
    aliases?: string[];
    sourceRef?: string;
  }>;
  submitRequiresApproval: boolean;
  canAutoSubmit: boolean;
  applyMode: ApplyMode;
  pauseReasons: PauseReason[];
}

export type BrowserApplyActionType =
  | "open_url"
  | "fill_field"
  | "upload_file"
  | "pause"
  | "submit"
  | "capture_receipt";

export type BrowserApplyActionStatus = "planned" | "done" | "paused" | "failed" | "skipped";

export interface BrowserApplyAction {
  id: ApplyCueId;
  type: BrowserApplyActionType;
  label: string;
  requiresApproval: boolean;
  target?: string;
  targetAliases?: string[];
  value?: string;
  pauseReason?: PauseReason | "user_approval_required";
}

export interface BrowserApplyPlan {
  id: ApplyCueId;
  jobId: ApplyCueId;
  url: string;
  company?: string;
  roleTitle?: string;
  applyMode: ApplyMode;
  canSubmit: boolean;
  submitRequiresApproval: boolean;
  pauseReasons: Array<PauseReason | "user_approval_required">;
  actions: BrowserApplyAction[];
  createdAt: string;
  cvVariantId?: ApplyCueId;
  cvPath?: string;
}

export interface BrowserActionLogEntry {
  id: ApplyCueId;
  planId: ApplyCueId;
  actionId: ApplyCueId;
  actionType: BrowserApplyActionType;
  status: BrowserApplyActionStatus;
  note?: string;
  recordedAt: string;
}

export interface ApplicationReceipt {
  id: ApplyCueId;
  jobId: ApplyCueId;
  status: "submitted" | "paused" | "failed" | "unknown";
  actionLog: BrowserActionLogEntry[];
  capturedAt: string;
  confirmationText?: string;
  confirmationUrl?: string;
  cvVariantId?: ApplyCueId;
}

export interface OutcomeEvent {
  id: ApplyCueId;
  applicationId: ApplyCueId;
  type: "submitted" | "confirmation" | "reply" | "interview" | "offer" | "rejection" | "withdrawn" | "user_feedback";
  note: string;
  occurredAt: string;
}

export interface ApplicationRecord {
  id: ApplyCueId;
  jobId: ApplyCueId;
  status: ApplicationStatus;
  cvVariantId?: ApplyCueId;
  applyMode?: ApplyMode;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export type ScanHistoryStatus = "seen" | "prepared" | "closed";

export interface ScanHistoryEntry {
  jobId: ApplyCueId;
  url: string;
  company: string;
  title: string;
  sourceId: ApplyCueId;
  sourceName: string;
  sourceKind: JobSource["kind"];
  status: ScanHistoryStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  applicationId?: ApplyCueId;
  cvVariantId?: ApplyCueId;
}

export interface RunManifest {
  id: ApplyCueId;
  kind: "sample_batch" | "daily_batch" | "single_job";
  startedAt: string;
  completedAt: string;
  profileId: ApplyCueId;
  jobIds: ApplyCueId[];
  cvVariantIds: ApplyCueId[];
  applicationIds: ApplyCueId[];
  generatedFiles: GeneratedFileManifest[];
  sourceCodeWriteCount: number;
  notes: string[];
  cvQuality?: ProgressCvQualitySummary;
  scanHistory?: ProgressScanHistorySummary;
  pendingQuestions?: PendingQuestion[];
  sourceScorecards?: ProgressSourceScorecardSummary;
  sourceOutcomes?: ProgressSourceOutcomeSummary;
  sourceQuality?: ProgressSourceQualitySummary;
  funnelHealth?: ProgressFunnelHealthSummary;
}
