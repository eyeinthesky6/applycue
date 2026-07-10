import { describe, expect, it } from "vitest";
import type { CvVariant, JobRecord, UserProfile } from "@applycue/core";
import { createApplicationDraft, createApplyRoute, createBrowserApplyPlan } from "./index.js";

describe("createApplicationDraft", () => {
  it("allows automated submit only after CV reconciliation passes", () => {
    const draft = createApplicationDraft(sampleJob(), sampleProfile(), sampleCvVariant("passed"));

    expect(draft.canAutoSubmit).toBe(true);
    expect(draft.submitRequiresApproval).toBe(false);
    expect(draft.pauseReasons).toEqual([]);
  });

  it("pauses automated submit when CV reconciliation needs review", () => {
    const draft = createApplicationDraft(sampleJob(), sampleProfile(), sampleCvVariant("needs_user_confirmation"));

    expect(draft.canAutoSubmit).toBe(false);
    expect(draft.submitRequiresApproval).toBe(true);
    expect(draft.pauseReasons).toContain("unsupported_cv_claim");
    expect(draft.answers.find((answer) => answer.field === "final_submit")?.value).toContain("Paused");
  });

  it("prepares common identity and contact answers from approved profile data", () => {
    const draft = createApplicationDraft(sampleJob(), sampleProfile(), sampleCvVariant("passed"));
    const answers = new Map(draft.answers.map((answer) => [answer.field, answer.value]));

    expect(answers.get("name")).toBe("Sample Candidate");
    expect(answers.get("first_name")).toBe("Sample");
    expect(answers.get("last_name")).toBe("Candidate");
    expect(answers.get("email")).toBe("sample@example.com");
    expect(answers.get("phone")).toBe("+1 555 0100");
    expect(answers.get("country")).toBe("United States");
    expect(answers.get("location")).toBe("New York, United States");
  });

  it("prepares public profile links from profile contact data", () => {
    const profile = sampleProfile();
    profile.contact = {
      ...profile.contact,
      links: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/sample-candidate" },
        { label: "Portfolio", url: "https://sample.example.com" }
      ]
    };

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));
    const answers = new Map(draft.answers.map((answer) => [answer.field, answer]));
    const browserPlan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });
    const linkedinAction = browserPlan.actions.find((action) => action.target === "linkedin_url");

    expect(answers.get("linkedin_url")?.value).toBe("https://www.linkedin.com/in/sample-candidate");
    expect(answers.get("linkedin_url")?.aliases).toContain("LinkedIn URL:");
    expect(answers.get("portfolio_url")?.value).toBe("https://sample.example.com");
    expect(linkedinAction?.targetAliases).toContain("LinkedIn URL:");
  });

  it("adds reusable approved application answers and ignores unapproved ones", () => {
    const profile = sampleProfile();
    profile.applicationAnswers = [
      {
        id: "answer-notice-period",
        field: "notice_period",
        value: "30 days",
        approvedByUser: true,
        aliases: ["What is your notice period?"],
        sourceRef: "user-confirmed",
        createdAt: "2026-07-06T00:00:00.000Z"
      },
      {
        id: "answer-current-salary",
        field: "current_salary",
        value: "Example value",
        approvedByUser: false,
        createdAt: "2026-07-06T00:00:00.000Z"
      }
    ];

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));
    const noticeAnswer = draft.answers.find((answer) => answer.field === "notice_period");

    expect(noticeAnswer?.value).toBe("30 days");
    expect(noticeAnswer?.aliases).toContain("What is your notice period?");
    expect(noticeAnswer?.aliases).toContain("When can you join?");
    expect(draft.answers.some((answer) => answer.field === "current_salary")).toBe(false);
  });

  it("expands approved reusable answers with default aliases for common portal wording", () => {
    const profile = sampleProfile();
    profile.applicationAnswers = [
      {
        id: "answer-work-authorization",
        field: "work_authorization",
        value: "Authorized to work in India",
        approvedByUser: true,
        aliases: ["Right to work"],
        sourceRef: "user-confirmed",
        createdAt: "2026-07-06T00:00:00.000Z"
      },
      {
        id: "answer-total-experience",
        field: "total_experience_years",
        value: "15+ years",
        approvedByUser: true,
        createdAt: "2026-07-06T00:00:00.000Z"
      }
    ];

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));
    const workAuthorization = draft.answers.find((answer) => answer.field === "work_authorization");
    const totalExperience = draft.answers.find((answer) => answer.field === "total_experience_years");

    expect(workAuthorization?.aliases).toContain("Right to work");
    expect(workAuthorization?.aliases).toContain("Are you legally authorized to work?");
    expect(totalExperience?.aliases).toContain("Total years of experience");
  });

  it("derives safe application answers only from explicit preferences", () => {
    const profile = sampleProfile();
    profile.preferences.noticePeriodDays = 45;
    profile.preferences.targetCompensation = 120000;
    profile.preferences.compensationCurrency = "USD";

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));
    const answers = new Map(draft.answers.map((answer) => [answer.field, answer]));

    expect(answers.get("notice_period")?.value).toBe("45 days");
    expect(answers.get("expected_salary")?.value).toBe("USD 120000");
    expect(answers.get("expected_salary")?.aliases).toContain("What is your desired salary?");
    expect(answers.has("current_salary")).toBe(false);
  });

  it("does not pause normal unlisted portals just because default portal policy asks first", () => {
    const profile = sampleProfile();
    profile.sourceSettings.defaultPortalApplyPolicy = "ask";

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));

    expect(draft.pauseReasons).not.toContain("unknown_portal");
  });

  it("pauses ask-before portals without blocking all small company portals", () => {
    const profile = sampleProfile();
    profile.sourceSettings.defaultPortalApplyPolicy = "ask";
    profile.sourceSettings.askBeforePortals = ["example.com"];

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));

    expect(draft.canAutoSubmit).toBe(false);
    expect(draft.submitRequiresApproval).toBe(true);
    expect(draft.pauseReasons).toContain("unknown_portal");
  });

  it("allows trusted portals to avoid the unknown portal pause", () => {
    const profile = sampleProfile();
    profile.sourceSettings.defaultPortalApplyPolicy = "ask";
    profile.sourceSettings.trustedPortals = ["example.com"];

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));

    expect(draft.canAutoSubmit).toBe(true);
    expect(draft.pauseReasons).not.toContain("unknown_portal");
  });

  it("pauses blocked portals as platform rules", () => {
    const profile = sampleProfile();
    profile.sourceSettings.blockedPortals = ["example.com"];

    const draft = createApplicationDraft(sampleJob(), profile, sampleCvVariant("passed"));

    expect(draft.canAutoSubmit).toBe(false);
    expect(draft.pauseReasons).toContain("platform_rule");
  });

  it("pauses sketchy recruiter data-harvest emails before application execution", () => {
    const profile = sampleProfile();
    profile.sourceSettings.fraudSignalTerms = ["profile database", "document before interview"];
    const job = {
      ...sampleJob(),
      source: {
        id: "email-alert",
        kind: "email_alert" as const,
        name: "User inbox job leads"
      },
      description: "You are shortlisted. Register your profile in our candidate database and send PAN before interview."
    };

    const draft = createApplicationDraft(job, profile, sampleCvVariant("passed"));

    expect(draft.canAutoSubmit).toBe(false);
    expect(draft.pauseReasons).toContain("fraud_signal");
  });

  it("routes normal web applications through browser preflight", () => {
    const profile = sampleProfile();
    const job = sampleJob();
    const cv = sampleCvVariant("passed");
    const draft = createApplicationDraft(job, profile, cv);
    const plan = createBrowserApplyPlan({ draft, job, cvPath: "outputs/cvs/job-1.docx" });

    const route = createApplyRoute({
      application: sampleApplication(),
      browserPlan: plan,
      draft,
      job,
      profile
    });

    expect(route.type).toBe("browser");
    expect(route.status).toBe("needs_preflight");
    expect(route.execution.browser?.planId).toBe(plan.id);
    expect(route.execution.browser?.preflightCommand).toContain("browser-live-preflight");
  });

  it("routes email-alert portal links through browser instead of treating sender metadata as an apply email", () => {
    const profile = sampleProfile();
    const job: JobRecord = {
      ...sampleJob(),
      source: {
        id: "email-lead-1",
        kind: "email_alert",
        name: "Gmail job alert - iimjobs"
      },
      url: "https://www.iimjobs.com/j/product-director-generative-ai-ecommercefintech-12-18-yrs-1706783",
      description: [
        "Email subject: Product Director - Generative AI at Employee Forums : Apply Now",
        "From: info@iimjobs.com",
        "IIMJobs alert with a portal application URL."
      ].join("\n\n")
    };
    const draft = createApplicationDraft(job, profile, sampleCvVariant("passed"));
    const plan = createBrowserApplyPlan({ draft, job, cvPath: "outputs/cvs/job-1.docx" });

    const route = createApplyRoute({
      application: sampleApplication(),
      browserPlan: plan,
      draft,
      job,
      profile
    });

    expect(route.type).toBe("browser");
    expect(route.status).toBe("needs_preflight");
  });

  it("routes email applications as drafts when an apply email is present", () => {
    const profile = sampleProfile();
    const job = {
      ...sampleJob(),
      description: "Please email careers@example.com with your CV."
    };
    const draft = createApplicationDraft(job, profile, sampleCvVariant("passed"));
    const plan = createBrowserApplyPlan({ draft, job, cvPath: "outputs/cvs/job-1.docx" });

    const route = createApplyRoute({
      application: sampleApplication(),
      browserPlan: plan,
      draft,
      job,
      profile
    });

    expect(route.type).toBe("email");
    expect(route.status).toBe("draft_only");
    expect(route.execution.email?.to).toEqual(["careers@example.com"]);
    expect(route.execution.email?.attachmentPaths).toEqual(["outputs/cvs/job-1.docx"]);
  });

  it("blocks route execution when the draft has a hard policy pause", () => {
    const profile = sampleProfile();
    profile.sourceSettings.blockedPortals = ["example.com"];
    const job = sampleJob();
    const draft = createApplicationDraft(job, profile, sampleCvVariant("passed"));
    const plan = createBrowserApplyPlan({ draft, job, cvPath: "outputs/cvs/job-1.docx" });

    const route = createApplyRoute({
      application: sampleApplication(),
      browserPlan: plan,
      draft,
      job,
      profile
    });

    expect(route.type).toBe("manual_review");
    expect(route.status).toBe("blocked");
    expect(route.execution.manualReview?.questions[0]).toContain("platform rule");
  });
});

function sampleProfile(): UserProfile {
  return {
    id: "user-1",
    name: "Sample Candidate",
    contact: {
      email: "sample@example.com",
      phone: "+1 555 0100",
      location: "New York, United States"
    },
    currentCountry: "United States",
    pastEmployers: [],
    preferences: {
      targetRoleTerms: [],
      adjacentRoleTerms: [],
      targetIndustries: [],
      excludedIndustries: [],
      preferredLocations: [],
      extraLocations: [],
      askBeforeLocations: [],
      acceptableWorkModes: ["remote"],
      targetSeniorities: [],
      acceptableSeniorities: [],
      employmentTypes: ["full_time"],
      companyStages: [],
      preferredCompanyNames: [],
      blockedCompanyNames: [],
      noGoRoleTerms: [],
      requiredKeywords: [],
      niceToHaveKeywords: [],
      excludedKeywords: [],
      workAuthorizationCountries: [],
      preferredTimezones: []
    },
    searchSettings: {
      searchCountries: [],
      searchAreas: [],
      remoteRegions: [],
      agentMayExpandSearchArea: true,
      informUserOnSearchAreaChange: true,
      standardHoursOnly: true,
      preferredShifts: ["standard"],
      askBeforeShifts: []
    },
    sourceSettings: {
      allowLoggedInBrowserAccess: false,
      defaultPortalApplyPolicy: "allow",
      trustedPortals: [],
      askBeforePortals: [],
      blockedPortals: [],
      fraudSignalTerms: []
    },
    applySettings: {
      mode: "daily",
      applicationsPerDay: 5,
      minimumFitToApply: 0.75,
      allowedSourceKinds: ["manual"],
      messagePolicy: "draft_only",
      pauseReasons: ["unsupported_cv_claim"],
      trackEmailReplies: false,
      allowRecruiterDmDrafts: false
    },
    matchSettings: {
      range: "normal",
      widenIfFewerThan: 5,
      relaxOrder: ["source"],
      minimumFitFloor: 0.55,
      allowAdjacentTitles: true,
      allowAdjacentIndustries: true
    },
    proofBank: []
  };
}

function sampleJob(): JobRecord {
  return {
    id: "job-1",
    source: {
      id: "manual",
      kind: "manual",
      name: "Manual"
    },
    company: "Example",
    title: "Example Role",
    url: "https://example.com/job",
    description: "Example job",
    workMode: "remote",
    discoveredAt: "2026-07-06T00:00:00.000Z",
    liveState: "live"
  };
}

function sampleCvVariant(reconciliationStatus: CvVariant["reconciliationStatus"]): CvVariant {
  return {
    id: "cv-1",
    jobId: "job-1",
    label: "Example - Example Role",
    formatMode: "standard_ats_v1",
    templateId: "applycue_standard_ats_v1",
    requirementMatches: [],
    unsupportedRequirements: [],
    reconciliationStatus,
    reconciliationNotes: [],
    changes: [],
    createdAt: "2026-07-06T00:00:00.000Z"
  };
}

function sampleApplication() {
  return {
    id: "application-1",
    jobId: "job-1",
    status: "prepared" as const,
    cvVariantId: "cv-1",
    notes: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  };
}
