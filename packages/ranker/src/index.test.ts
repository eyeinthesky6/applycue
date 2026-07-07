import { describe, expect, it } from "vitest";
import type { JobRecord, UserPreferences, UserProfile } from "@applycue/core";
import { buildRelaxPlan, rankJob } from "./index.js";

describe("rankJob", () => {
  const basePreferences: UserPreferences = {
    targetRoleTerms: ["ai transformation"],
    adjacentRoleTerms: ["product strategy"],
    targetIndustries: ["fintech"],
    excludedIndustries: [],
    preferredLocations: ["remote"],
    extraLocations: ["india"],
    askBeforeLocations: [],
    acceptableWorkModes: ["remote", "hybrid"],
    targetSeniorities: ["director", "vp"],
    acceptableSeniorities: ["director", "vp", "c_level"],
    employmentTypes: ["full_time"],
    companyStages: ["startup", "scaleup", "enterprise"],
    preferredCompanyNames: [],
    blockedCompanyNames: [],
    noGoRoleTerms: [],
    requiredKeywords: [],
    niceToHaveKeywords: ["ai", "fintech"],
    excludedKeywords: [],
    workAuthorizationCountries: ["india"],
    preferredTimezones: []
  };

  it("prioritizes roles that match goals and proof", () => {
    const profile: UserProfile = {
      id: "user-1",
      pastEmployers: [],
      preferences: {
        ...basePreferences
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["remote india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 20,
        minimumFitToApply: 0.75,
        allowedSourceKinds: [
          "company_site",
          "ats",
          "job_board",
          "social_post",
          "community_post",
          "newsletter",
          "recruiter_message",
          "email_alert",
          "manual"
        ],
        messagePolicy: "draft_only",
        pauseReasons: [
          "missing_required_answer",
          "sensitive_personal_data",
          "unsupported_cv_claim",
          "work_authorization",
          "compensation",
          "relocation",
          "platform_rule"
        ],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-1",
          claim: "Led AI transformation work in fintech.",
          evidence: "Profile contains prior AI, fintech, and transformation work.",
          tags: ["ai", "fintech", "transformation"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-1",
      source: {
        id: "manual",
        kind: "manual",
        name: "Manual"
      },
      company: "Example Fintech",
      title: "Head of AI Transformation",
      url: "https://example.com/jobs/1",
      description: "Lead AI transformation for fintech product teams.",
      workMode: "remote",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);

    expect(ranked.decision).toBe("apply");
    expect(ranked.priority).toBeGreaterThan(0.7);
    expect(ranked.nextStep).toBe("apply");
  });

  it("does not label roles as review when they are below the configured fit floor", () => {
    const profile: UserProfile = {
      id: "user-fit-floor",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["product management"],
        adjacentRoleTerms: [],
        targetIndustries: ["fintech"],
        niceToHaveKeywords: []
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
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
        mode: "review",
        applicationsPerDay: 5,
        minimumFitToApply: 0.8,
        allowedSourceKinds: ["job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: [],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "minimum_fit"],
        minimumFitFloor: 0.7,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: []
    };

    const job: JobRecord = {
      id: "job-below-floor",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "Generic Product Co",
      title: "Product Management Lead",
      url: "https://example.com/jobs/product-management-lead",
      description: "Own product management rituals for a business unit.",
      location: "India",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);

    expect(ranked.priority).toBeGreaterThanOrEqual(0.5);
    expect(ranked.priority).toBeLessThan(profile.matchSettings.minimumFitFloor);
    expect(ranked.decision).toBe("watch");
  });

  it("does not block India jobs when providers return IN region codes", () => {
    const profile: UserProfile = {
      id: "user-region-code",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        preferredLocations: ["india"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.75,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-1",
          claim: "Led AI transformation work in fintech.",
          evidence: "Profile contains prior AI, fintech, and transformation work.",
          tags: ["ai", "fintech", "transformation"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-region-code",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "Example Fintech",
      title: "Head of AI Transformation",
      url: "https://example.com/jobs/region-code",
      description: "Lead AI transformation for fintech product teams.",
      location: "KA, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const workAuthorizationGate = ranked.gates.find((gate) => gate.id === "work-authorization");

    expect(workAuthorizationGate?.passed).toBe(true);
    expect(ranked.priority).toBeGreaterThan(0);
  });

  it("does not block India jobs when ATS providers return Indian city names without country suffix", () => {
    const profile: UserProfile = {
      id: "user-indian-city",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["senior product manager"],
        preferredLocations: ["india", "bangalore"],
        workAuthorizationCountries: ["india"],
        niceToHaveKeywords: ["roadmap", "fintech"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
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
        mode: "review",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: [],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "fintech"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-bangalore",
      source: {
        id: "greenhouse",
        kind: "ats",
        name: "Greenhouse"
      },
      company: "India Product Co",
      title: "Senior Product Manager",
      url: "https://example.com/jobs/senior-product-manager-bangalore",
      description: "Own product roadmap for a fintech platform.",
      location: "Bangalore",
      workMode: "unknown",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const workAuthorizationGate = ranked.gates.find((gate) => gate.id === "work-authorization");

    expect(workAuthorizationGate?.passed).toBe(true);
    expect(ranked.priority).toBeGreaterThan(0);
  });

  it("does not hard-block broad remote regions that include the user's authorized region", () => {
    const profile: UserProfile = {
      id: "user-remote-region",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["senior product manager", "head of product"],
        preferredLocations: ["remote", "india"],
        workAuthorizationCountries: ["india"],
        niceToHaveKeywords: ["roadmap", "fintech"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "fintech"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-broad-remote-region",
      source: {
        id: "remotive",
        kind: "job_board",
        name: "Remotive"
      },
      company: "Remote Product Co",
      title: "Senior Product Manager",
      url: "https://example.com/jobs/senior-product-manager",
      description: "Own product roadmap for a fintech SaaS product.",
      location: "Americas, Europe, Asia, Oceania",
      workMode: "remote",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const workAuthorizationGate = ranked.gates.find((gate) => gate.id === "work-authorization");

    expect(workAuthorizationGate?.passed).toBe(true);
    expect(ranked.priority).toBeGreaterThan(0);
  });

  it("treats target roles and locations as alternatives instead of a checklist", () => {
    const profile: UserProfile = {
      id: "user-role-alternatives",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["vp product", "head of product", "director product", "product strategy"],
        adjacentRoleTerms: ["growth product"],
        targetIndustries: ["fintech", "payments", "saas"],
        preferredLocations: ["remote", "india", "delhi", "bangalore"],
        niceToHaveKeywords: ["roadmap", "gtm", "payments"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap, GTM, payments, and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "gtm", "payments", "fintech"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-role-alternatives",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "Payments Co",
      title: "Head of Product",
      url: "https://example.com/jobs/head-product",
      description: "Own product roadmap, GTM, SaaS payments, and fintech growth.",
      location: "KA, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);

    expect(ranked.priority).toBeGreaterThanOrEqual(0.72);
    expect(ranked.decision).toBe("apply");
  });

  it("does not over-rank non-product titles just because descriptions mention product words", () => {
    const profile: UserProfile = {
      id: "user-product-target",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["vp product", "head of product", "director product", "product strategy"],
        adjacentRoleTerms: ["growth product"],
        targetIndustries: ["fintech", "payments", "saas"],
        preferredLocations: ["india"],
        niceToHaveKeywords: ["roadmap", "gtm", "payments"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap, GTM, payments, and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "gtm", "payments", "fintech"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-sales-description-product",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "SaaS Co",
      title: "Partner Sales Manager India",
      url: "https://example.com/jobs/partner-sales",
      description: "Sell SaaS products, coordinate GTM strategy, and work with product teams.",
      location: "KA, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const roleFit = ranked.components.find((component) => component.id === "role-objective-fit");

    expect(roleFit?.score).toBeLessThan(0.5);
    expect(ranked.priority).toBeLessThan(profile.matchSettings.minimumFitFloor);
  });

  it("does not prepare adjacent-only titles when the title lacks the target role anchor", () => {
    const profile: UserProfile = {
      id: "user-product-target-adjacent",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["vp product", "head of product", "director product", "product strategy"],
        adjacentRoleTerms: ["business development", "gtm strategy"],
        targetIndustries: ["fintech", "payments", "saas"],
        preferredLocations: ["india"],
        niceToHaveKeywords: ["roadmap", "gtm", "payments"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap, GTM, payments, and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "gtm", "payments", "fintech", "business development"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-adjacent-business-development",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "Driven Minds And Global solutions",
      title: "Business Development Manager",
      url: "https://example.com/jobs/business-development-manager",
      description: "Build partnerships for SaaS payment products and work with product teams on GTM strategy.",
      location: "Gurgaon, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const roleFit = ranked.components.find((component) => component.id === "role-objective-fit");

    expect(roleFit?.score).toBeLessThan(0.5);
    expect(ranked.priority).toBeLessThan(profile.matchSettings.minimumFitFloor);
    expect(ranked.decision).toBe("watch");
  });

  it("still ranks the same role when the user explicitly targets it", () => {
    const profile: UserProfile = {
      id: "user-business-development-target",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["business development", "head of business development"],
        adjacentRoleTerms: ["gtm strategy"],
        targetIndustries: ["fintech", "payments", "saas"],
        preferredLocations: ["india"],
        niceToHaveKeywords: ["partnerships", "gtm", "payments"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-bd",
          claim: "Led business development, GTM, partnerships, and payments growth.",
          evidence: "Approved BD-oriented profile.",
          tags: ["business development", "gtm", "partnerships", "payments", "fintech"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-target-business-development",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "Payments Co",
      title: "Business Development Manager",
      url: "https://example.com/jobs/business-development-manager",
      description: "Own partnerships, GTM, and payment product growth for fintech customers.",
      location: "Gurgaon, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);

    expect(ranked.priority).toBeGreaterThanOrEqual(profile.applySettings.minimumFitToApply);
    expect(ranked.decision).toBe("apply");
  });

  it("does not prepare business analyst titles only because the description mentions product strategy", () => {
    const profile: UserProfile = {
      id: "user-product-target-business-analyst",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["vp product", "head of product", "director product", "product strategy"],
        adjacentRoleTerms: ["business development", "gtm strategy"],
        targetIndustries: ["fintech", "payments", "saas"],
        preferredLocations: ["india"],
        niceToHaveKeywords: ["roadmap", "gtm", "payments", "digital banking"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap, GTM, payments, and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "gtm", "payments", "fintech", "digital banking"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-business-analyst-description-product",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "Barclays",
      title: "Avaloq Business Analyst",
      url: "https://example.com/jobs/avaloq-business-analyst",
      description: "Support digital banking product strategy, payments roadmap, and stakeholder GTM reporting.",
      location: "Pune, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const roleFit = ranked.components.find((component) => component.id === "role-objective-fit");

    expect(roleFit?.score).toBeLessThan(0.5);
    expect(ranked.priority).toBeLessThan(profile.matchSettings.minimumFitFloor);
    expect(ranked.decision).toBe("watch");
  });

  it("does not treat product engineering titles as product-management matches", () => {
    const profile: UserProfile = {
      id: "user-product-target-product-engineer",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        targetRoleTerms: ["vp product", "head of product", "director product", "product management"],
        adjacentRoleTerms: ["product strategy"],
        targetIndustries: ["fintech", "payments", "saas"],
        preferredLocations: ["india"],
        niceToHaveKeywords: ["roadmap", "gtm", "payments"]
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["company_site", "ats", "job_board", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Led product roadmap, GTM, payments, and fintech product work.",
          evidence: "Base CV product role.",
          tags: ["product roadmap", "gtm", "payments", "fintech"]
        }
      ]
    };

    const job: JobRecord = {
      id: "job-product-engineer",
      source: {
        id: "jobspy",
        kind: "job_board",
        name: "JobSpy"
      },
      company: "SaaS Co",
      title: "Staff Product Engineer",
      url: "https://example.com/jobs/product-engineer",
      description: "Build product features with engineering teams for a SaaS payments product.",
      location: "KA, IN",
      workMode: "hybrid",
      discoveredAt: "2026-07-05T00:00:00.000Z",
      liveState: "live"
    };

    const ranked = rankJob(job, profile);
    const roleFit = ranked.components.find((component) => component.id === "role-objective-fit");

    expect(roleFit?.score).toBeLessThan(0.5);
    expect(ranked.priority).toBeLessThan(profile.matchSettings.minimumFitFloor);
  });

  it("suggests a relax plan when the batch is short", () => {
    const profile: UserProfile = {
      id: "user-2",
      pastEmployers: [],
      preferences: {
        ...basePreferences,
        askBeforeLocations: ["onsite outside india"],
        allowRelocation: false
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["remote india"],
        remoteRegions: ["india"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: ["night", "rotational", "weekend"]
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: ["payment required"]
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 20,
        minimumFitToApply: 0.75,
        allowedSourceKinds: ["company_site", "ats", "job_board"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "location", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: []
    };

    const plan = buildRelaxPlan(profile, 5);

    expect(plan.map((step) => step.area)).toEqual(["source", "location", "minimum_fit"]);
    expect(plan[1]?.needsUserReview).toBe(true);
  });
});
