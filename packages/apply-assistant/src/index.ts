import type {
  ApplicationAnswer,
  ApplicationDraft,
  ApplicationReceipt,
  BrowserActionLogEntry,
  BrowserApplyAction,
  BrowserApplyActionStatus,
  BrowserApplyPlan,
  CvVariant,
  JobRecord,
  PauseReason,
  UserProfile
} from "@applycue/core";

const NOW = "2026-07-06T00:00:00.000Z";

export interface CreateBrowserApplyPlanInput {
  cvPath?: string;
  draft: ApplicationDraft;
  job: JobRecord;
  now?: string;
}

export interface CreateApplicationReceiptInput {
  actionLog: BrowserActionLogEntry[];
  confirmationText?: string;
  confirmationUrl?: string;
  now?: string;
  plan: BrowserApplyPlan;
  status: ApplicationReceipt["status"];
}

export function createApplicationDraft(
  job: JobRecord,
  profile: UserProfile,
  cvVariant?: CvVariant
): ApplicationDraft {
  const cvNeedsReview = Boolean(cvVariant && cvVariant.reconciliationStatus !== "passed");
  const policyPauseReasons = applicationPolicyPauseReasons(job, profile);
  const draft: ApplicationDraft = {
    jobId: job.id,
    answers: [],
    submitRequiresApproval: profile.applySettings.mode === "review" || cvNeedsReview || policyPauseReasons.length > 0,
    canAutoSubmit: profile.applySettings.mode !== "review" && !cvNeedsReview && policyPauseReasons.length === 0,
    applyMode: profile.applySettings.mode,
    pauseReasons: [
      ...(cvNeedsReview ? ["unsupported_cv_claim" as const] : []),
      ...policyPauseReasons
    ]
  };

  if (cvVariant) draft.cvVariantId = cvVariant.id;

  if (profile.name) {
    addAnswer(draft, "name", profile.name);
    const split = splitCandidateName(profile.name);
    if (split.firstName) addAnswer(draft, "first_name", split.firstName);
    if (split.lastName) addAnswer(draft, "last_name", split.lastName);
  }

  if (profile.contact?.email) {
    addAnswer(draft, "email", profile.contact.email);
  }
  if (profile.contact?.phone) addAnswer(draft, "phone", profile.contact.phone);
  if (profile.currentCountry) addAnswer(draft, "country", profile.currentCountry);
  if (profile.contact?.location) addAnswer(draft, "location", profile.contact.location);
  addContactLinkAnswers(draft, profile);

  addApprovedApplicationAnswers(draft, profile.applicationAnswers ?? []);
  addPreferenceApplicationAnswers(draft, profile);

  draft.answers.push({
    field: "final_submit",
    value:
      cvNeedsReview
        ? "Paused until CV reconciliation passes."
        : profile.applySettings.mode === "review"
        ? "Prepared only. User must approve before submit."
        : "Can submit automatically if no pause reason is triggered.",
    needsApproval: profile.applySettings.mode === "review" || cvNeedsReview
  });

  return draft;
}

function addAnswer(
  draft: ApplicationDraft,
  field: string,
  value: string,
  options: {
    aliases?: string[];
    needsApproval?: boolean;
    sourceRef?: string;
  } = {}
): void {
  const trimmed = value.trim();
  if (!trimmed || draft.answers.some((answer) => answer.field === field)) return;
  const answer: ApplicationDraft["answers"][number] = {
    field,
    value: trimmed,
    needsApproval: options.needsApproval ?? false
  };
  const aliases = uniqueValues(options.aliases ?? []);
  if (aliases.length > 0) answer.aliases = aliases;
  if (options.sourceRef) answer.sourceRef = options.sourceRef;
  draft.answers.push(answer);
}

function splitCandidateName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {})
  };
}

function addApprovedApplicationAnswers(draft: ApplicationDraft, answers: ApplicationAnswer[]): void {
  for (const answer of answers) {
    if (answer.approvedByUser !== true) continue;
    const options: {
      aliases?: string[];
      needsApproval?: boolean;
      sourceRef?: string;
    } = {
      needsApproval: answer.needsApproval ?? false,
      sourceRef: answer.sourceRef ?? answer.id
    };
    if (answer.aliases?.length) options.aliases = answer.aliases;
    addAnswer(draft, answer.field, answer.value, options);
  }
}

function addContactLinkAnswers(draft: ApplicationDraft, profile: UserProfile): void {
  const links = profile.contact?.links ?? [];
  const linkedin = findProfileLink(links, /linkedin/i);
  if (linkedin) {
    addAnswer(draft, "linkedin_url", linkedin.url, {
      aliases: ["LinkedIn", "LinkedIn URL", "LinkedIn URL:", "LinkedIn Profile", "LinkedIn profile URL"],
      sourceRef: "profile.contact.links"
    });
  }

  const github = findProfileLink(links, /github/i);
  if (github) {
    addAnswer(draft, "github_url", github.url, {
      aliases: ["GitHub", "GitHub URL", "GitHub profile", "GitHub profile URL"],
      sourceRef: "profile.contact.links"
    });
  }

  const portfolio = findProfileLink(links, /portfolio|personal\s*site|website|homepage/i);
  if (portfolio) {
    addAnswer(draft, "portfolio_url", portfolio.url, {
      aliases: ["Portfolio", "Portfolio URL", "Website", "Personal website", "Website URL"],
      sourceRef: "profile.contact.links"
    });
  }
}

function findProfileLink(
  links: NonNullable<NonNullable<UserProfile["contact"]>["links"]>,
  matcher: RegExp
): { label: string; url: string } | undefined {
  return links.find((link) => matcher.test(`${link.label} ${link.url}`));
}

function addPreferenceApplicationAnswers(draft: ApplicationDraft, profile: UserProfile): void {
  const prefs = profile.preferences;
  if (typeof prefs.noticePeriodDays === "number" && Number.isFinite(prefs.noticePeriodDays)) {
    addAnswer(draft, "notice_period", `${prefs.noticePeriodDays} days`, {
      aliases: ["notice period", "What is your notice period?", "When can you join?", "availability to join"],
      sourceRef: "preferences.noticePeriodDays"
    });
  }

  const compensationValue = formatCompensation(
    prefs.targetCompensation ?? prefs.minimumCompensation,
    prefs.compensationCurrency
  );
  if (compensationValue) {
    addAnswer(draft, "expected_salary", compensationValue, {
      aliases: [
        "desired_salary",
        "expected compensation",
        "desired compensation",
        "What is your desired salary?",
        "What is your expected salary?"
      ],
      sourceRef: prefs.targetCompensation ? "preferences.targetCompensation" : "preferences.minimumCompensation"
    });
  }
}

function applicationPolicyPauseReasons(job: JobRecord, profile: UserProfile): PauseReason[] {
  const reasons: PauseReason[] = [];
  const sourceText = `${job.source.id} ${job.source.name} ${job.source.url ?? ""} ${job.url}`;
  const fullText = `${sourceText} ${job.company} ${job.title} ${job.description}`;

  if (profile.sourceSettings.fraudSignalTerms.some((term) => fraudTermMatches(fullText, term))) {
    reasons.push("fraud_signal");
  }
  if (profile.sourceSettings.blockedPortals.some((term) => textContainsPhrase(sourceText, term))) {
    reasons.push("unknown_portal");
  }

  const trusted = profile.sourceSettings.trustedPortals.some((term) => textContainsPhrase(sourceText, term));
  const askBefore = profile.sourceSettings.askBeforePortals.some((term) => textContainsPhrase(sourceText, term));
  if (!trusted && (askBefore || profile.sourceSettings.defaultPortalApplyPolicy === "ask")) {
    reasons.push("unknown_portal");
  }
  return [...new Set(reasons)];
}

function textContainsPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeComparable(phrase);
  return Boolean(normalizedPhrase) && normalizeComparable(text).includes(normalizedPhrase);
}

function fraudTermMatches(text: string, term: string): boolean {
  const normalizedTerm = normalizeComparable(term);
  if (!normalizedTerm) return false;
  const normalizedText = normalizeComparable(text);
  if (normalizedTerm === "deposit") {
    return /\b(pay|payment|fee|registration|training|security|refundable|required|before)\b.{0,40}\bdeposit\b/.test(normalizedText) ||
      /\bdeposit\b.{0,40}\b(pay|payment|fee|registration|training|security|refundable|required|before)\b/.test(normalizedText);
  }
  if (normalizedTerm === "payment required") {
    return /\b(payment|required|pay|fee)\b.{0,40}\b(payment|required|pay|fee)\b/.test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatCompensation(value: number | undefined, currency: string | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const amount = Number.isInteger(value) ? String(value) : String(value);
  return currency?.trim() ? `${currency.trim()} ${amount}` : amount;
}

export function createBrowserApplyPlan(input: CreateBrowserApplyPlanInput): BrowserApplyPlan {
  const createdAt = input.now ?? NOW;
  const pauseReasons = createPlanPauseReasons(input.draft);
  const actions: BrowserApplyAction[] = [
    {
      id: `${input.draft.jobId}-open-application`,
      type: "open_url",
      label: "Open application page",
      target: input.job.url,
      value: input.job.url,
      requiresApproval: false
    }
  ];

  for (const answer of input.draft.answers.filter((item) => item.field !== "final_submit")) {
    actions.push({
      id: `${input.draft.jobId}-fill-${slugify(answer.field)}`,
      type: "fill_field",
      label: `Fill ${answer.field}`,
      target: answer.field,
      value: answer.value,
      requiresApproval: answer.needsApproval,
      ...(answer.aliases?.length ? { targetAliases: answer.aliases } : {})
    });
  }

  if (input.cvPath) {
    actions.push({
      id: `${input.draft.jobId}-upload-cv`,
      type: "upload_file",
      label: "Upload generated CV",
      target: "resume_or_cv",
      value: input.cvPath,
      requiresApproval: false
    });
  }

  if (pauseReasons.length > 0) {
    const firstPauseReason = pauseReasons[0] ?? "user_approval_required";
    actions.push({
      id: `${input.draft.jobId}-pause-before-submit`,
      type: "pause",
      label: "Pause before final submit",
      value: pauseReasons.join(", "),
      pauseReason: firstPauseReason,
      requiresApproval: true
    });
  } else {
    actions.push(
      {
        id: `${input.draft.jobId}-submit`,
        type: "submit",
        label: "Submit application",
        requiresApproval: false
      },
      {
        id: `${input.draft.jobId}-capture-receipt`,
        type: "capture_receipt",
        label: "Capture confirmation receipt",
        requiresApproval: false
      }
    );
  }

  const plan: BrowserApplyPlan = {
    id: `${input.draft.jobId}-browser-apply-plan`,
    jobId: input.draft.jobId,
    url: input.job.url,
    company: input.job.company,
    roleTitle: input.job.title,
    applyMode: input.draft.applyMode,
    canSubmit: input.draft.canAutoSubmit && pauseReasons.length === 0,
    submitRequiresApproval: input.draft.submitRequiresApproval,
    pauseReasons,
    actions,
    createdAt
  };
  if (input.draft.cvVariantId) plan.cvVariantId = input.draft.cvVariantId;
  if (input.cvPath) plan.cvPath = input.cvPath;
  return plan;
}

export function describeBrowserPlan(draft: ApplicationDraft): string {
  const fieldCount = draft.answers.filter((answer) => answer.field !== "final_submit").length;
  if (draft.pauseReasons.length > 0) {
    return `Prepare ${fieldCount} field(s). Pause before submit because ${draft.pauseReasons.join(", ")}.`;
  }
  if (draft.submitRequiresApproval) {
    return `Prepare ${fieldCount} field(s). Stop before final submit and ask the user for approval.`;
  }
  return `Prepare ${fieldCount} field(s), submit under policy, and capture the receipt.`;
}

export function createInitialBrowserActionLog(plan: BrowserApplyPlan, now = NOW): BrowserActionLogEntry[] {
  return plan.actions.map((action) => ({
    id: `${action.id}-planned`,
    planId: plan.id,
    actionId: action.id,
    actionType: action.type,
    status: "planned",
    recordedAt: now
  }));
}

export function recordBrowserAction(
  actionLog: BrowserActionLogEntry[],
  plan: BrowserApplyPlan,
  actionId: string,
  status: BrowserApplyActionStatus,
  note?: string,
  now = NOW
): BrowserActionLogEntry[] {
  const action = plan.actions.find((item) => item.id === actionId);
  if (!action) throw new Error(`Unknown browser action id: ${actionId}`);
  const entry: BrowserActionLogEntry = {
    id: `${actionId}-${status}-${actionLog.length + 1}`,
    planId: plan.id,
    actionId,
    actionType: action.type,
    status,
    recordedAt: now
  };
  if (note) entry.note = note;
  return [...actionLog, entry];
}

export function createApplicationReceipt(input: CreateApplicationReceiptInput): ApplicationReceipt {
  const receipt: ApplicationReceipt = {
    id: `${input.plan.jobId}-receipt`,
    jobId: input.plan.jobId,
    status: input.status,
    actionLog: input.actionLog,
    capturedAt: input.now ?? NOW
  };
  if (input.confirmationText) receipt.confirmationText = input.confirmationText;
  if (input.confirmationUrl) receipt.confirmationUrl = input.confirmationUrl;
  if (input.plan.cvVariantId) receipt.cvVariantId = input.plan.cvVariantId;
  return receipt;
}

function createPlanPauseReasons(draft: ApplicationDraft): Array<PauseReason | "user_approval_required"> {
  const pauseReasons: Array<PauseReason | "user_approval_required"> = [...draft.pauseReasons];
  if (draft.submitRequiresApproval) pauseReasons.push("user_approval_required");
  if (draft.answers.some((answer) => answer.field !== "final_submit" && answer.needsApproval)) {
    pauseReasons.push("user_approval_required");
  }
  return [...new Set(pauseReasons)];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "field";
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
