import { describe, expect, it } from "vitest";
import type { JobRecord, UserProfile } from "@applycue/core";
import { generateJobSpecificCv, renderStandardAtsDocx } from "./index.js";

describe("generateJobSpecificCv", () => {
  it("passes supported requirements", () => {
    const profile = profileWithProof();
    const result = generateJobSpecificCv(jobWithDescription("Lead AI transformation for fintech teams."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.variant.formatMode).toBe("standard_ats_v1");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "ai" && match.status === "supported")).toBe(true);
    expect(result.markdown).not.toContain("Requirement Reconciliation");
  });

  it("blocks unsupported required requirements", () => {
    const profile = profileWithProof();
    const result = generateJobSpecificCv(jobWithDescription("Lead healthcare compliance programs."), profile);

    expect(result.reconciliationReport.status).toBe("blocked");
    expect(result.variant.unsupportedRequirements).toContain("healthcare compliance");
    expect(result.markdown).not.toContain("Led healthcare compliance");
  });

  it("passes product manager when approved evidence supports product management", () => {
    const profile = profileWithProof();
    const result = generateJobSpecificCv(jobWithDescription("Own product manager roadmap execution."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "product manager" && match.status === "supported")).toBe(true);
  });

  it("maps regulated industry requirements to approved banking and lending evidence", () => {
    const profile = profileWithProof();
    profile.proofBank.push({
      id: "proof-banking-lending",
      claim: "Led digital banking and lending product work in financial services.",
      evidence: "Base CV includes banking, NBFC, and lending roles.",
      tags: ["digital banking", "lending", "financial services"],
      kind: "work"
    });

    const result = generateJobSpecificCv(jobWithDescription("Own product strategy in a regulated financial services environment."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "regulated industry" && match.status === "supported")).toBe(true);
  });

  it("maps automation requirements to approved autopay and voicebot product evidence", () => {
    const profile = profileWithProof();
    profile.proofBank.push({
      id: "proof-automation-products",
      claim: "Launched UPI autopay and AI voicebot products for customer and payment workflows.",
      evidence: "Base CV includes UPI autopay, AI voicebot, and chat SaaS product work.",
      tags: ["upi autopay", "voicebot", "chat saas", "digital payments"],
      kind: "work"
    });

    const result = generateJobSpecificCv(jobWithDescription("Experience building automation products."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "automation" && match.status === "supported")).toBe(true);
  });

  it("does not support automation from generic AI transformation wording alone", () => {
    const profile = profileWithProof();
    const result = generateJobSpecificCv(jobWithDescription("Experience building automation products."), profile);

    expect(result.reconciliationReport.status).toBe("blocked");
    expect(result.variant.unsupportedRequirements).toContain("automation");
  });

  it("does not treat reporting-line titles as candidate requirements", () => {
    const profile = profileWithProof();
    profile.preferences.targetRoleTerms = [...profile.preferences.targetRoleTerms, "chief product officer"];

    const result = generateJobSpecificCv(
      jobWithDescription("Reports To\n\nHead of Trading Products / Chief Product Officer\n\nOwn product manager roadmap execution."),
      profile
    );

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "chief product officer")).toBe(false);
  });

  it("does not treat provider tech-stack appendices as role requirements", () => {
    const profile = profileWithProof();

    const result = generateJobSpecificCv(
      jobWithDescription(
        "Requirements: 8+ years of experience in Product Management.\nNOT YOUR TECH STACK? We also have projects in Python and AI Automation Architecture."
      ),
      profile
    );

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "python")).toBe(false);
    expect(result.variant.requirementMatches.some((match) => match.requirement === "automation")).toBe(false);
  });

  it("asks for confirmation on major adjacent repositioning", () => {
    const profile = profileWithProof();
    profile.proofBank.push({
      id: "proof-adjacent-chief-staff",
      claim: "Supported chief executive staff planning and operating cadence.",
      evidence: "Base CV includes executive operating rhythm work, but not that formal role.",
      tags: ["chief", "staff", "operations"],
      kind: "work"
    });
    const result = generateJobSpecificCv(jobWithDescription("Own chief of staff roadmap execution."), profile);

    expect(result.reconciliationReport.status).toBe("needs_user_confirmation");
    expect(result.reconciliationReport.coverage.needsConfirmation).toBe(1);
    expect(result.variant.requirementMatches.some((match) => match.requirement === "chief of staff" && match.status === "needs_confirmation")).toBe(true);
  });

  it("does not treat one shared product word as adjacent evidence", () => {
    const profile = profileWithProof();
    profile.preferences.requiredKeywords = ["product marketing"];

    const result = generateJobSpecificCv(jobWithDescription("Lead product marketing strategy for partner launches."), profile);

    expect(result.reconciliationReport.status).toBe("blocked");
    expect(result.variant.unsupportedRequirements).toContain("product marketing");
    expect(result.variant.requirementMatches.some((match) => match.requirement === "product marketing" && match.status === "needs_confirmation")).toBe(false);
  });

  it("maps senior product requirements to approved proof aliases", () => {
    const profile = profileWithProof();
    profile.proofBank.push({
      id: "proof-senior-product-growth",
      claim: "Owned GTM, payment gateway growth, customer acquisition, and revenue optimization.",
      evidence: "Base CV includes GTM, payment gateway, acquisition, and revenue optimization work.",
      tags: ["gtm", "payment gateway", "customer acquisition", "revenue optimization", "b2b saas"],
      kind: "work"
    });

    const result = generateJobSpecificCv(
      jobWithDescription("Lead go to market, payments, customer acquisition, revenue optimization, and B2B SaaS roadmap."),
      profile
    );

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.reconciliationReport.coverage.supported).toBeGreaterThanOrEqual(5);
    expect(result.variant.requirementMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requirement: "go to market", status: "supported" }),
        expect.objectContaining({ requirement: "payments", status: "supported" }),
        expect.objectContaining({ requirement: "customer acquisition", status: "supported" }),
        expect.objectContaining({ requirement: "revenue optimization", status: "supported" }),
        expect.objectContaining({ requirement: "b2b saas", status: "supported" })
      ])
    );
  });

  it("renders company-level experience and base-CV education in the standard CV", () => {
    const profile = profileWithProof();
    profile.pastEmployers = [
      {
        company: "Example Bank",
        designation: "Head of Product",
        startDate: "2020",
        endDate: "2024"
      }
    ];
    profile.baseCvText = `Sample Candidate

Awards & Engagements
Best innovation award

EDUCATION
MBA from Example Institute
BE Mechanical from Example University
`.replace(/\n/g, "\r");
    profile.proofBank[0] = {
      ...profile.proofBank[0]!,
      evidence: "Base CV Example Bank role."
    };

    const result = generateJobSpecificCv(jobWithDescription("Lead AI transformation for fintech teams."), profile);

    expect(result.markdown).toContain("## Summary");
    expect(result.markdown).toContain("## Experience");
    expect(result.markdown).toContain("### Head of Product, Example Bank (2020 - 2024)");
    expect(result.markdown).toContain("- Led AI transformation work across product workflows.");
    expect(result.markdown).toContain("## Awards And Engagements");
    expect(result.markdown).toContain("- Best innovation award");
    expect(result.markdown).toContain("## Education");
    expect(result.markdown).toContain("- MBA from Example Institute");
    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain("data-template-id=\"applycue_standard_ats_v1\"");
    expect(result.html).toContain("Head of Product, Example Bank");
  });

  it("keeps relevant real base-CV bullets under the matching employer", () => {
    const profile = profileWithProof();
    profile.pastEmployers = [
      {
        company: "Example Bank",
        designation: "Head of Product"
      }
    ];
    profile.baseCvText = `Sample Candidate

Example Bank        Head of Product
Defined product roadmap for a neobank and digital acquisition journey.
Launched UPI autopay and embedded payments with measurable repayment lift.
Managed unrelated facilities and office seating plans.

EDUCATION
MBA from Example Institute
`;
    profile.proofBank[0] = {
      ...profile.proofBank[0]!,
      evidence: "Base CV Example Bank role.",
      tags: ["ai", "transformation", "product roadmap", "upi", "payments"]
    };

    const result = generateJobSpecificCv(
      jobWithDescription("Own product roadmap, UPI payments, and AI transformation."),
      profile
    );

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.markdown).toContain("- Defined product roadmap for a neobank and digital acquisition journey.");
    expect(result.markdown).toContain("- Launched UPI autopay and embedded payments with measurable repayment lift.");
    expect(result.markdown).not.toContain("Managed unrelated facilities and office seating plans.");
  });

  it("does not render empty employer sections", () => {
    const profile = profileWithProof();
    profile.pastEmployers = [
      {
        company: "Empty Co",
        designation: "Strategy Consultant"
      }
    ];
    profile.baseCvText = "Sample Candidate\n\nEmpty Co        Strategy Consultant\n\nEDUCATION\nMBA from Example Institute";

    const result = generateJobSpecificCv(jobWithDescription("Lead AI transformation for fintech teams."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.markdown).not.toContain("### Strategy Consultant, Empty Co");
  });

  it("renders a real DOCX upload artifact from the reconciled CV", async () => {
    const profile = profileWithProof();
    const result = generateJobSpecificCv(jobWithDescription("Lead AI transformation for fintech teams."), profile);

    const docx = await renderStandardAtsDocx(result.markdown);

    expect(docx.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(docx.length).toBeGreaterThan(1000);
  });

  it("suppresses near-duplicate employer bullets from proof and base CV text", () => {
    const profile = profileWithProof();
    profile.pastEmployers = [
      {
        company: "Example Bank",
        designation: "Head of Product"
      }
    ];
    profile.baseCvText = `Sample Candidate

Example Bank        Head of Product
Drove digital transformation in fintech, scaling digital payments from 50% to 75% on a Rs 500 Cr book.
Launched UPI autopay and embedded payments with measurable repayment lift.

EDUCATION
MBA from Example Institute
`;
    profile.proofBank[0] = {
      ...profile.proofBank[0]!,
      claim: "Drove digital transformation in fintech, scaling digital payments from 50% to 75% on a Rs 500 Cr book and launching UPI autopay.",
      evidence: "Base CV Example Bank role.",
      tags: ["ai", "transformation", "fintech", "payments"]
    };

    const result = generateJobSpecificCv(jobWithDescription("Lead fintech payments transformation."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.markdown.match(/Drove digital transformation/g)).toHaveLength(1);
    expect(result.markdown).toContain("- Launched UPI autopay and embedded payments with measurable repayment lift.");
  });

  it("suppresses overlapping startup-achievement bullets that share the same lead claim", () => {
    const profile = profileWithProof();
    profile.pastEmployers = [
      {
        company: "Six Ideas Technology",
        designation: "Director of Strategy and Product"
      }
    ];
    profile.baseCvText = `Sample Candidate

Six Ideas Technology        Director of Strategy and Product
Built a SaaS FinTech startup, acquiring 1,000+ users & managed investor relations to secure $1M valuation in 3 months.
Launched UPI & card-based payment gateway & digital asset marketplace, ranking #3 globally in Web3 payments.

EDUCATION
MBA from Example Institute
`;
    profile.proofBank[0] = {
      ...profile.proofBank[0]!,
      claim: "Built a SaaS FinTech startup, acquiring 1,000+ users, managing investor relations, launching payment products, and designing AI voicebot and chat SaaS products.",
      evidence: "Base CV Six Ideas Technology role.",
      tags: ["saas", "fintech", "startup", "payments", "ai"]
    };

    const result = generateJobSpecificCv(jobWithDescription("Lead AI work for fintech teams."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.markdown.match(/Built a SaaS FinTech startup/g)).toHaveLength(1);
    expect(result.markdown).toContain("Launched UPI & card-based payment gateway");
  });

  it("suppresses overlapping payment-gateway bullets that share the same lead claim", () => {
    const profile = profileWithProof();
    profile.pastEmployers = [
      {
        company: "Innoviti Payment Technologies",
        designation: "Product Head - Online Payment Gateway"
      }
    ];
    profile.baseCvText = `Sample Candidate

Innoviti Payment Technologies        Product Head - Online Payment Gateway
Built product, CVP and GTM for $1bn GTV payment gateway and brand EMI for 8% mom growth.
Created B2B SAAS solutions for payment in online and offline payments over POS, using phone and QR and UPI.

EDUCATION
MBA from Example Institute
`;
    profile.proofBank[0] = {
      ...profile.proofBank[0]!,
      claim: "Built product, CVP, and GTM for a payment gateway and brand EMI product, launched B2B SaaS payment solutions, and reduced POS payment costs.",
      evidence: "Base CV Innoviti Payment Technologies role.",
      tags: ["payment gateway", "brand emi", "b2b saas", "payments", "gtm"]
    };

    const result = generateJobSpecificCv(jobWithDescription("Lead payment gateway and GTM work."), profile);

    expect(result.reconciliationReport.status).toBe("passed");
    expect(result.markdown.match(/Built product, CVP/g)).toHaveLength(1);
    expect(result.markdown).toContain("Created B2B SAAS solutions");
  });
});

function profileWithProof(): UserProfile {
  return {
    id: "user-1",
    name: "Sample Candidate",
    headline: "AI transformation leader",
    pastEmployers: [],
    preferences: {
      targetRoleTerms: ["ai transformation"],
      adjacentRoleTerms: [],
      targetIndustries: ["fintech"],
      excludedIndustries: [],
      preferredLocations: [],
      extraLocations: [],
      askBeforeLocations: [],
      acceptableWorkModes: ["remote", "hybrid"],
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
      mode: "review",
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
    proofBank: [
      {
        id: "proof-ai",
        claim: "Led AI transformation work across product workflows.",
        evidence: "Base CV includes AI transformation and product strategy work.",
        tags: ["ai", "transformation", "product strategy"],
        kind: "work"
      },
      {
        id: "proof-fintech",
        claim: "Worked on fintech strategy.",
        evidence: "Base CV includes fintech strategy work.",
        tags: ["fintech", "strategy"],
        kind: "work"
      }
    ]
  };
}

function jobWithDescription(description: string): JobRecord {
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
    description,
    workMode: "remote",
    discoveredAt: "2026-07-06T00:00:00.000Z",
    liveState: "live"
  };
}
