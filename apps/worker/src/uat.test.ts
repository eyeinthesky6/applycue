import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runApplyCueUat } from "./uat.js";

describe("runApplyCueUat", () => {
  it("writes a UAT report for an agent-run local profile", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-uat-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(path.join(profileDir, "assets", "jobs"), { recursive: true });
    await mkdir(path.join(profileDir, "assets", "base-cvs"), { recursive: true });
    await writeFile(
      path.join(profileDir, "assets", "base-cvs", "uat-base.md"),
      `UAT Candidate

Alpha Bank        Head of Product
Led product strategy for fintech lending and digital banking growth.
Owned roadmap planning, customer discovery, and senior stakeholder communication.

Beta Pay        Product Lead
Built payments product roadmap and GTM launch plan for merchant payments.
Improved onboarding conversion through product analytics and funnel changes.

Gamma SaaS        Product Strategy Consultant
Created product discovery system for B2B SaaS onboarding and retention.
Led pricing, packaging, roadmap sequencing, and GTM experiments for growth.

Awards & Engagements
Best product innovation award

Education
MBA from Example Institute
`,
      "utf8"
    );
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "UAT Candidate",
          email: "uat@example.com",
          currentDesignation: "Head of Product",
          baseCvPath: "assets/base-cvs/uat-base.md",
          pastEmployers: [
            {
              company: "Alpha Bank",
              designation: "Head of Product"
            },
            {
              company: "Beta Pay",
              designation: "Product Lead"
            },
            {
              company: "Gamma SaaS",
              designation: "Product Strategy Consultant"
            }
          ]
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 3,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Worked as a Head of Product and led product strategy work.",
            evidence: "Base CV Alpha Bank role.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          },
          {
            id: "proof-payments",
            claim: "Built payments product roadmap and GTM launch plans.",
            evidence: "Base CV Beta Pay role.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          },
          {
            id: "proof-saas",
            claim: "Created SaaS product discovery, pricing, packaging, roadmap sequencing, and GTM experiments.",
            evidence: "Base CV Gamma SaaS role.",
            tags: ["head of product", "product strategy", "fintech", "saas", "gtm"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "assets/jobs/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(profileDir, "assets", "jobs", "jobs.jsonl"),
      `${[
        {
          company: "UAT Fintech",
          title: "Head of Product",
          url: "https://example.com/uat-job",
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time",
          liveState: "live"
        },
        {
          company: "Closed UAT Fintech",
          title: "Head of Product",
          url: "https://example.com/closed-uat-job",
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time",
          liveState: "closed"
        }
      ].map((row) => JSON.stringify(row)).join("\n")}\n`,
      "utf8"
    );

    const report = await runApplyCueUat({
      autoApproveSources: false,
      applyCueHome,
      generatedSourceExpansion: false,
      installTools: false,
      workspaceRoot
    });

    expect(report.status).toBe("warn");
    expect(report.counts.jobs).toBe(2);
    expect(report.counts.cvs).toBe(1);
    expect(report.counts.applications).toBe(1);
    expect(report.counts.browserReceipts).toBe(1);
    expect(report.checks.find((check) => check.id === "closed-job-safety")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "closed-job-safety")?.detail).toContain("closed job(s) stayed out");
    expect(report.checks.find((check) => check.id === "cv-docx-output")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "cv-completeness")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "cv-completeness")?.detail).toContain("named employer structure");
    expect(report.checks.find((check) => check.id === "cv-completeness")?.detail).toContain("no near-duplicate bullets");
    expect(report.checks.find((check) => check.id === "cv-completeness")?.detail).toContain("role-specific substance");
    expect(report.checks.find((check) => check.id === "ats-diagnostics")?.status).toBe("warn");
    expect(report.checks.find((check) => check.id === "ats-diagnostics")?.detail).toContain("diagnostic report(s)");
    expect(report.checks.find((check) => check.id === "browser-plan-docx")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "browser-preflight")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "browser-plan-dry-run")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "decision-queue")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "decision-queue")?.detail).toContain("ranked decision");
    expect(report.checks.find((check) => check.id === "chat-summary")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "batch-volume")?.status).toBe("warn");
    expect(report.checks.find((check) => check.id === "batch-volume")?.detail).toBe("Prepared 1 of configured 3 per day.");
    expect(await readFile(report.paths.report, "utf8")).toContain("\"id\": \"applycue-local-uat\"");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("# ApplyCue UAT Report");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("Closed Job Safety");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("DOCX Upload Artifact");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("CV Completeness");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("Browser dry-run receipts: 1");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("Browser Apply Preflight");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("Ranked Decision Queue");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("latest-job-decisions.json");
    const decisionQueue = JSON.parse(await readFile(report.paths.decisionQueue, "utf8")) as { queueCount: number; decisions: unknown[] };
    expect(decisionQueue.queueCount).toBe(report.counts.jobs);
    expect(decisionQueue.decisions).toHaveLength(report.counts.jobs);
    const dashboard = await readFile(report.paths.dashboard, "utf8");
    expect(dashboard).toContain("Receipt");
    expect(dashboard).toContain("ATS Diagnostics");
    expect(dashboard).toContain("Duplicates Blocked");
    expect(dashboard).toContain("Safety Blocks");
    expect(dashboard).toContain("Parseability and safe JD-term coverage only");
    expect(dashboard).toContain("../jds/");
    expect(dashboard).toContain("Paused");
    expect(dashboard).toContain("outputs/browser-receipts/");
    const summary = await readFile(report.paths.summary, "utf8");
    expect(summary).toContain("# ApplyCue Run Summary");
    expect(summary).toContain("## ATS Diagnostics");
    expect(summary).toContain("## Duplicates Blocked");
    expect(summary).toContain("## Safety Blocks");
    expect(summary).toContain("Missing supported JD terms: 0");
    expect(summary).toContain("UAT Fintech - Head of Product");
    expect(summary).toContain("outputs/browser-receipts/");
    expect(summary).toContain("(Paused)");
    const cvDir = path.join(profileDir, "outputs", "cvs");
    const cvFile = (await readdir(cvDir)).find((name) => name.endsWith("-cv-standard-ats-v1.md"));
    expect(cvFile).toBeTruthy();
    const renderedCv = await readFile(path.join(cvDir, cvFile!), "utf8");
    expect(renderedCv).toContain("Alpha Bank");
    expect(renderedCv).toContain("Beta Pay");
    const atsDir = path.join(profileDir, "outputs", "ats-diagnostics");
    const atsFile = (await readdir(atsDir)).find((name) => name.endsWith("-ats-diagnostics.json"));
    expect(atsFile).toBeTruthy();
    expect(await readFile(path.join(atsDir, atsFile!), "utf8")).toContain("\"status\": \"warn\"");
    const jdDir = path.join(profileDir, "outputs", "jds");
    const jdFile = (await readdir(jdDir)).find((name) => name.endsWith(".md"));
    expect(jdFile).toBeTruthy();
    const renderedJd = await readFile(path.join(jdDir, jdFile!), "utf8");
    expect(renderedJd).toContain("# UAT Fintech - Head of Product");
    expect(renderedJd).toContain("Lead product strategy for fintech.");
  });
});
