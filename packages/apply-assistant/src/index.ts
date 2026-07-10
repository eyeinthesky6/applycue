import type {
  ApplicationAnswer,
  ApplicationDraft,
  ApplicationReceipt,
  ApplicationRecord,
  ApplyRoute,
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

export interface CreateApplyRouteInput {
  application: ApplicationRecord;
  browserPlan: BrowserApplyPlan;
  draft: ApplicationDraft;
  job: JobRecord;
  now?: string;
  profile: UserProfile;
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
    const aliases = uniqueValues([
      ...(answer.aliases ?? []),
      ...defaultApplicationAnswerAliases(answer.field)
    ]);
    const options: {
      aliases?: string[];
      needsApproval?: boolean;
      sourceRef?: string;
    } = {
      needsApproval: answer.needsApproval ?? false,
      sourceRef: answer.sourceRef ?? answer.id
    };
    if (aliases.length > 0) options.aliases = aliases;
    addAnswer(draft, answer.field, answer.value, options);
  }
}

function defaultApplicationAnswerAliases(field: string): string[] {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases: Record<string, string[]> = {
    current_company: ["Current company", "Present employer", "Current employer", "Where do you currently work?"],
    current_salary: [
      "Current salary",
      "Current compensation",
      "Current CTC",
      "Present salary",
      "Present compensation",
      "Present CTC"
    ],
    current_title: ["Current title", "Current designation", "Current role", "Present designation"],
    expected_salary: [
      "desired_salary",
      "Expected salary",
      "Expected compensation",
      "Expected CTC",
      "Desired salary",
      "Desired compensation",
      "What is your desired salary?",
      "What is your expected salary?"
    ],
    location: ["Current location", "City", "Where are you located?", "Location"],
    notice_period: ["notice period", "What is your notice period?", "When can you join?", "availability to join", "joining date"],
    office_location_availability: [
      "Are you willing to work from office?",
      "Can you work onsite?",
      "Preferred office location",
      "Willing to relocate to office location"
    ],
    product_management_years: [
      "Product management experience",
      "Years of product management experience",
      "How many years of PM experience do you have?"
    ],
    relocation_availability: ["Are you willing to relocate?", "Willing to relocate", "Relocation"],
    total_experience_years: ["Total experience", "Years of experience", "Total years of experience"],
    visa_sponsorship: [
      "Do you require visa sponsorship?",
      "Will you now or in the future require sponsorship?",
      "Sponsorship required"
    ],
    work_authorization: [
      "Are you authorized to work?",
      "Are you legally authorized to work?",
      "Right to work",
      "Work authorization",
      "Work eligibility"
    ],
    working_hours_availability: ["Working hours", "Shift availability", "Preferred shift", "Can you work this shift?"]
  };
  return aliases[normalized] ?? [];
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
    reasons.push("platform_rule");
  }

  const trusted = profile.sourceSettings.trustedPortals.some((term) => textContainsPhrase(sourceText, term));
  const askBefore = profile.sourceSettings.askBeforePortals.some((term) => textContainsPhrase(sourceText, term));
  if (!trusted && askBefore) {
    reasons.push("unknown_portal");
  }
  if (!trusted && profile.sourceSettings.defaultPortalApplyPolicy === "block") reasons.push("platform_rule");
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
  if (normalizedTerm === "profile database") {
    return /\b(profile|resume|cv|candidate)\b.{0,80}\b(database|data bank|db|registration|register|pool)\b/.test(normalizedText) ||
      /\b(database|data bank|db|registration|register|pool)\b.{0,80}\b(profile|resume|cv|candidate)\b/.test(normalizedText);
  }
  if (normalizedTerm === "document before interview") {
    return /\b(aadhaar|aadhar|pan|passport|bank statement|salary slip|uan|pf)\b.{0,100}\b(before|prior|pre interview|shortlist|shortlisted|call|discussion|interview)\b/.test(normalizedText) ||
      /\b(before|prior|pre interview|shortlist|shortlisted|call|discussion|interview)\b.{0,100}\b(aadhaar|aadhar|pan|passport|bank statement|salary slip|uan|pf)\b/.test(normalizedText);
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

export function createApplyRoute(input: CreateApplyRouteInput): ApplyRoute {
  const createdAt = input.now ?? NOW;
  const policyPauseReasons = [...new Set(input.browserPlan.pauseReasons)];
  const base = {
    id: `${input.application.id}-apply-route`,
    applicationId: input.application.id,
    jobId: input.job.id,
    canSubmit: input.browserPlan.canSubmit,
    submitRequiresApproval: input.browserPlan.submitRequiresApproval,
    pauseReasons: policyPauseReasons,
    createdAt,
    artifacts: {
      browserPlanId: input.browserPlan.id,
      ...(input.browserPlan.cvPath ? { cvPath: input.browserPlan.cvPath } : {})
    }
  };

  if (hasBlockingPauseReason(policyPauseReasons)) {
    return {
      ...base,
      type: "manual_review",
      status: "blocked",
      label: "Manual review",
      reason: "ApplyCue policy found a blocking reason before execution.",
      execution: {
        manualReview: {
          questions: policyPauseReasons.map((reason) => `Resolve ${humanizeIdentifier(reason)} before applying.`)
        }
      },
      notes: ["Do not open or submit this application until the blocker is resolved."]
    };
  }

  const apiAdapter = knownApiAdapter(input.job);
  if (apiAdapter) {
    return {
      ...base,
      type: "api",
      status: input.browserPlan.canSubmit ? "ready" : "paused",
      label: "API apply",
      reason: `Known safe adapter: ${apiAdapter.adapterId}.`,
      execution: {
        api: {
          adapterId: apiAdapter.adapterId,
          ...(apiAdapter.endpoint ? { endpoint: apiAdapter.endpoint } : {}),
          method: "POST"
        }
      },
      notes: [
        "Use only the adapter named in this route.",
        "If the adapter is unavailable, fall back to a fresh browser preflight."
      ]
    };
  }

  const emailAddresses = extractApplicationEmails(input.job);
  if (emailAddresses.length > 0) {
    const attachmentPaths = input.browserPlan.cvPath ? [input.browserPlan.cvPath] : [];
    return {
      ...base,
      type: "email",
      status: input.profile.applySettings.messagePolicy === "auto_send_simple" && input.draft.canAutoSubmit
        ? "ready"
        : "draft_only",
      label: "Email apply",
      reason: "The job post exposes an application email address.",
      execution: {
        email: {
          to: emailAddresses,
          subject: `Application for ${input.job.title} - ${input.profile.name ?? "Candidate"}`,
          body: createApplicationEmailBody(input.job, input.profile),
          attachmentPaths
        }
      },
      notes: [
        "Draft the email from this route.",
        input.profile.applySettings.messagePolicy === "auto_send_simple"
          ? "Send only when the page and draft still match the user's policy."
          : "Do not send automatically; user approval is required."
      ]
    };
  }

  if (shouldUseDmRoute(input.job, input.profile)) {
    const attachmentPaths = input.browserPlan.cvPath ? [input.browserPlan.cvPath] : [];
    return {
      ...base,
      type: "dm",
      status: "draft_only",
      label: "DM draft",
      reason: "The source is a social or recruiter message and recruiter DM drafts are enabled.",
      execution: {
        dm: {
          platform: inferDmPlatform(input.job),
          targetUrl: input.job.url,
          message: createRecruiterDmBody(input.job, input.profile),
          attachmentPaths
        }
      },
      notes: ["Draft only. User approval is required before sending a DM."]
    };
  }

  if (isHttpUrl(input.job.url)) {
    return {
      ...base,
      type: "browser",
      status: "needs_preflight",
      label: "Browser apply",
      reason: "No safe direct API/email route is known, so the agent should use browser control.",
      execution: {
        browser: {
          planId: input.browserPlan.id,
          preflightCommand: `pnpm applycue:browser-live-preflight -- --plan-id ${input.browserPlan.id}`,
          applyCommand: `pnpm applycue:browser-live-apply -- --plan-id ${input.browserPlan.id}`
        }
      },
      notes: [
        "Run live preflight before filling the page.",
        input.browserPlan.canSubmit
          ? "Submit only when the plan, command, and user policy all allow it."
          : "Fill/upload can run in review mode, then pause before final submit."
      ]
    };
  }

  return {
    ...base,
    type: "manual_review",
    status: "paused",
    label: "Manual review",
    reason: "ApplyCue could not find a safe executable application route.",
    execution: {
      manualReview: {
        questions: ["Find a current application URL, email address, or recruiter contact for this role."]
      }
    },
    notes: ["The agent should research a safe route or ask the user before applying."]
  };
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

function hasBlockingPauseReason(reasons: Array<PauseReason | "user_approval_required">): boolean {
  return reasons.some((reason) => reason === "fraud_signal" || reason === "platform_rule" || reason === "unsupported_cv_claim");
}

function knownApiAdapter(job: JobRecord): { adapterId: string; endpoint?: string } | undefined {
  const provider = String((job.source as { provider?: unknown }).provider ?? "");
  const sourceText = `${job.source.id} ${job.source.name} ${provider}`.toLowerCase();
  if (!/\b(api_apply|direct_apply_api|applycue_api_adapter)\b/.test(sourceText)) return undefined;
  return {
    adapterId: provider || job.source.id,
    ...(job.url ? { endpoint: job.url } : {})
  };
}

function extractApplicationEmails(job: JobRecord): string[] {
  const mailto = job.url.match(/^mailto:([^?]+)/i)?.[1];
  if (mailto) return uniqueValues([mailto]);

  const text = `${job.url} ${job.description}`;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emails: string[] = [];
  for (const match of text.matchAll(emailPattern)) {
    const email = match[0];
    const start = Math.max(0, match.index - 120);
    const end = Math.min(text.length, match.index + email.length + 120);
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    const context = text.slice(start, end);
    if (looksLikeApplicationEmailContext(context, before)) emails.push(email);
  }
  return uniqueValues(emails);
}

function shouldUseDmRoute(job: JobRecord, profile: UserProfile): boolean {
  return profile.applySettings.allowRecruiterDmDrafts &&
    (job.source.kind === "social_post" || job.source.kind === "recruiter_message");
}

function looksLikeApplicationEmailContext(context: string, beforeEmail: string): boolean {
  if (/\b(from|reply-to|sender|sent by)\s*:?\s*$/i.test(beforeEmail)) return false;
  return /\b(apply|application|careers?|cv|email|mail|resume|send|share)\b/i.test(context) &&
    !/\b(from|reply-to|unsubscribe|sent by)\s*:?\s*$/i.test(context.slice(0, 40));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function createApplicationEmailBody(job: JobRecord, profile: UserProfile): string {
  const candidate = profile.name ?? "Candidate";
  return [
    `Hi,`,
    ``,
    `I am applying for the ${job.title} role at ${job.company}.`,
    `I have attached my CV for your review.`,
    ``,
    `Regards,`,
    candidate
  ].join("\n");
}

function createRecruiterDmBody(job: JobRecord, profile: UserProfile): string {
  const candidate = profile.name ?? "Candidate";
  return [
    `Hi, I noticed the ${job.title} role at ${job.company}.`,
    `I am interested and would like to apply. I can share my CV if this is still open.`,
    `Thanks, ${candidate}`
  ].join("\n");
}

function inferDmPlatform(job: JobRecord): string {
  const url = job.url.toLowerCase();
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("x.com") || url.includes("twitter.com")) return "x";
  if (url.includes("facebook.com")) return "facebook";
  return job.source.kind === "recruiter_message" ? "recruiter_message" : "social";
}

function humanizeIdentifier(value: string): string {
  return value.replace(/_/g, " ");
}
