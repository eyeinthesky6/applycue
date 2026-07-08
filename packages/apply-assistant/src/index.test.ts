import { describe, expect, it } from "vitest";
import type { CvVariant, JobRecord, UserProfile } from "@applycue/core";
import { createApplicationDraft, createBrowserApplyPlan } from "./index.js";

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
    expect(draft.answers.some((answer) => answer.field === "current_salary")).toBe(false);
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
      defaultPortalApplyPolicy: "ask",
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
