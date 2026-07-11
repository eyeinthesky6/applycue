import { describe, expect, it } from "vitest";
import {
  buildSourceScorecardSummary,
  buildSourceOutcomeSummary,
  buildProgressSnapshot,
  createApplicationRecord,
  parseOutcomeEventsJsonLines,
  renderProgressChatSummaryMarkdown,
  renderProgressDashboardHtml,
  transitionApplication
} from "./index.js";

describe("progress dashboard", () => {
  it("summarizes applications and renders local HTML", () => {
    const submitted = transitionApplication(
      createApplicationRecord({ id: "app-1", jobId: "job-1" }),
      "submitted"
    );

    const snapshot = buildProgressSnapshot({
      id: "daily-1",
      periodStart: "2026-07-06",
      periodEnd: "2026-07-06",
      applications: [submitted],
      items: [
        {
          applicationId: "app-1",
          jobId: "job-1",
          company: "Example Fintech",
          title: "Head of Product",
          status: "submitted",
          browserPlanPath: "outputs/browser-plans/example-plan.json",
          browserReceiptPath: "outputs/browser-receipts/example-receipt.json",
          browserReceiptStatus: "paused",
          cvDocxPath: "outputs/cvs/example.docx",
          cvHtmlPath: "outputs/cvs/example.html",
          cvPath: "outputs/cvs/example.md",
          jdPath: "outputs/jds/job-1.md",
          atsDiagnosticsPath: "outputs/ats-diagnostics/example.json",
          reconciliationPath: "outputs/reconciliation/example.json",
          reconciliationStatus: "passed",
          canAutoSubmit: false,
          submitRequiresApproval: true,
          pauseReasons: [],
          nextStep: "Review and approve before submit."
        }
      ],
      jobDecisions: [
        {
          jobId: "job-2",
          company: "Noisy Source Co",
          title: "Sales Manager",
          sourceName: "JobSpy",
          location: "KA, IN",
          decision: "watch",
          reasons: ["Location or work mode fits preferences."],
          failedGates: ["reconciliation: Unsupported requirement must not be claimed: healthcare compliance"],
          reconciliationStatus: "blocked",
          skippedReason: "Unsupported requirement must not be claimed: healthcare compliance",
          nextStep: "Skipped until CV reconciliation passes."
        },
        {
          jobId: "job-3",
          company: "Promoted Fintech",
          title: "Head of Product",
          sourceName: "ATS",
          decision: "watch",
          recordedDecision: "apply",
          recordedReasons: ["Codex found strong payments and product-leadership evidence."],
          decisionActorKind: "agent",
          decisionActorName: "codex",
          reasons: ["Backend score was below today's threshold."],
          failedGates: [],
          nextStep: "Approved by recorded external judgement and prepared under configured policy."
        }
      ],
      livePreflight: {
        status: "pause",
        summary: "Live browser preflight paused for Example Fintech - Head of Product.",
        selectedCompany: "Example Fintech",
        selectedRoleTitle: "Head of Product",
        checkedUrl: "https://example.com/apply",
        answerPromptCount: 2,
        reusableAnswerPromptCount: 1,
        oneOffAnswerPromptCount: 1,
        questions: [
          "What is your notice period?",
          "One required field on the page had no visible label; inspect it before answering."
        ],
        paths: {
          answerPromptsHtml: "outputs/live-preflight/live-answer-prompts.html",
          answerPromptsMarkdown: "outputs/live-preflight/live-answer-prompts.md",
          approvalTemplate: "outputs/live-preflight/live-answer-approval-template.json",
          report: "outputs/live-preflight/live-preflight-report.json"
        }
      },
      outputRoot: "C:\\Users\\Example\\.applycue\\profiles\\default",
      profileId: "profile-1",
      runId: "run-1",
      pendingQuestionItems: [
        {
          id: "question-seniority-example",
          question: "Should Product Manager at Global Enterprise Co count as target seniority?",
          reason: "Company title ladders can differ by employer size.",
          blocksPipeline: false,
          createdAt: "2026-07-07T00:00:00.000Z"
        }
      ],
      nextActions: ["Review one compensation question"],
      notes: ["First local dashboard run"],
      cvQuality: {
        generatedCvs: 2,
        baseCvChars: 7200,
        minimumCvChars: 4700,
        minimumBaseCvPercent: 65,
        minimumBullets: 42,
        employerHeadings: 7,
        minimumEmployerBullets: 3
      },
      atsDiagnostics: {
        reports: 2,
        passed: 1,
        warned: 1,
        warnings: 2,
        missingSupportedTerms: 1,
        unsupportedMentions: 0,
        topWarnings: ["Supported JD term is not visible in the generated CV: payments."]
      },
      scanHistory: {
        historyPath: "data/local/scan-history.jsonl",
        inputJobs: 4,
        keptJobs: 3,
        mode: "daily",
        recordedJobs: 3,
        repostClusters: 1,
        repostWindowDays: 90,
        repostedJobs: 2,
        skippedClosed: 0,
        skippedJobs: 1,
        skippedPrepared: 1,
        topReposts: [
          {
            company: "Example Fintech",
            role: "Head of Product Growth",
            appearances: 2,
            firstSeenAt: "2026-07-01T00:00:00.000Z",
            lastSeenAt: "2026-07-06T00:00:00.000Z",
            daysSpan: 5,
            urls: ["https://example.com/jobs/1", "https://example.com/jobs/2"]
          }
        ]
      },
      dedupe: {
        inputJobs: 12,
        keptJobs: 3,
        blockedDuplicates: 2,
        sameUrl: 1,
        sameCompanySimilarRole: 1,
        alreadyHandledRepeats: 1,
        totalAvoided: 3
      },
      safety: {
        checkedJobs: 4,
        fraudSignalBlocks: 1,
        blockedPortalBlocks: 1,
        portalPolicyBlocks: 0,
        totalSafetyBlocks: 2,
        examples: [
          "Scam Co - Product Lead: Job/source matched fraud signal: registration fee.",
          "Blocked Portal Co - Head of Product: Portal is blocked by user policy."
        ]
      },
      sourceOutcomes: {
        eventPath: "data/local/outcomes.jsonl",
        trackedApplications: 2,
        outcomeEvents: 2,
        preparedApplications: 2,
        submitted: 2,
        replies: 1,
        interviews: 1,
        offers: 0,
        rejections: 1,
        positiveOutcomes: 1,
        sources: [
          {
            sourceId: "jobspy-product",
            sourceName: "JobSpy product search",
            sourceKind: "job_board",
            trackedApplications: 2,
            preparedApplications: 2,
            submitted: 2,
            replies: 1,
            interviews: 1,
            offers: 0,
            rejections: 1,
            positiveOutcomes: 1,
            lastOutcomeAt: "2026-07-07T00:00:00.000Z"
          }
        ]
      },
      sourceScorecards: {
        fetchedJobs: 12,
        keptJobs: 4,
        filteredJobs: 8,
        preparedApplications: 2,
        submitted: 2,
        replies: 1,
        interviews: 1,
        offers: 0,
        rejections: 1,
        positiveOutcomes: 1,
        sources: [
          {
            sourceId: "jobspy-product",
            sourceName: "JobSpy product search",
            sourceKind: "job_board",
            fetchedJobs: 12,
            keptJobs: 4,
            filteredJobs: 8,
            preparedApplications: 2,
            submitted: 2,
            replies: 1,
            interviews: 1,
            offers: 0,
            rejections: 1,
            positiveOutcomes: 1,
            precision: 0.33,
            yield: 0.17,
            lastOutcomeAt: "2026-07-07T00:00:00.000Z"
          }
        ]
      },
      sourceQuality: {
        inputJobs: 12,
        keptJobs: 4,
        filteredJobs: 8,
        byReason: {
          title: 6,
          industry: 0,
          location: 1,
          content: 1
        }
      }
    });

    expect(snapshot.applications.submitted).toBe(1);
    expect(snapshot.pendingQuestions).toBe(1);

    const html = renderProgressDashboardHtml(snapshot);
    expect(html).toContain("ApplyCue Control Room");
    expect(html).toContain("3 pending questions");
    expect(html).toContain("live preflight Pause");
    expect(html).toContain("Live Preflight");
    expect(html).toContain("Live browser preflight paused for Example Fintech");
    expect(html).toContain("Answer review");
    expect(html).toContain("What is your notice period?");
    expect(html).toContain("Pending Questions");
    expect(html).toContain("Should Product Manager at Global Enterprise Co count as target seniority?");
    expect(html).toContain("Source Quality");
    expect(html).toContain("12");
    expect(html).toContain("4");
    expect(html).toContain("8");
    expect(html).toContain("6 title");
    expect(html).toContain("0 industry");
    expect(html).toContain("1 location");
    expect(html).toContain("1 content");
    expect(html).toContain("Duplicates Blocked");
    expect(html).toContain("2");
    expect(html).toContain("1 same URL");
    expect(html).toContain("1 company + role");
    expect(html).toContain("1 already handled");
    expect(html).toContain("Safety Blocks");
    expect(html).toContain("Risky jobs stopped before CV or application work.");
    expect(html).toContain("1 fraud signal");
    expect(html).toContain("1 blocked portal");
    expect(html).toContain("Scam Co - Product Lead");
    expect(html).toContain("Source Scorecards");
    expect(html).toContain("4/12 kept");
    expect(html).toContain("33% kept rate");
    expect(html).toContain("CV Quality");
    expect(html).toContain("Full-CV evidence");
    expect(html).toContain("Generated CVs");
    expect(html).toContain("65% of base CV");
    expect(html).toContain("3 min bullets per section");
    expect(html).toContain("ATS Diagnostics");
    expect(html).toContain("Parseability and safe JD-term coverage only");
    expect(html).toContain("Supported JD term is not visible");
    expect(html).toContain("Scan History");
    expect(html).toContain("Repeat skips");
    expect(html).toContain("1 prepared");
    expect(html).toContain("0 closed");
    expect(html).toContain("1 repost signals");
    expect(html).toContain("Head of Product Growth");
    expect(html).toContain("3 recorded");
    expect(html).toContain("Source Learning");
    expect(html).toContain("JobSpy product search");
    expect(html).toContain("1 replies");
    expect(html).toContain("1 rejections");
    expect(html).toContain("Batch Health");
    expect(html).toContain("submitted");
    expect(html).toContain("Example Fintech");
    expect(html).toContain("Head of Product");
    expect(html).toContain("Decision Queue");
    expect(html).toContain("Noisy Source Co");
    expect(html).toContain("Promoted Fintech");
    expect(html).toContain("Recorded by codex; backend suggested Watch");
    expect(html).toContain("Skipped reason:");
    expect(html).toContain("Unsupported requirement must not be claimed");
    expect(html).toContain("outputs/cvs/example.docx");
    expect(html).toContain("outputs/cvs/example.html");
    expect(html).toContain("outputs/cvs/example.md");
    expect(html).toContain("../ats-diagnostics/example.json");
    expect(html).toContain("../jds/job-1.md");
    expect(html).toContain("outputs/browser-plans/example-plan.json");
    expect(html).toContain("outputs/browser-receipts/example-receipt.json");
    expect(html).toContain("Passed");
    expect(html).toContain("Paused");
    expect(html).toContain("Upload DOCX");
    expect(html).toContain("View CV");
    expect(html).toContain("Markdown");
    expect(html).toContain("ATS diagnostics");
    expect(html).toContain("Browser plan");
    expect(html).toContain("Receipt");
    expect(html).toContain("Review one compensation question");

    const summary = renderProgressChatSummaryMarkdown(snapshot);
    expect(summary).toContain("# ApplyCue Run Summary");
    expect(summary).toContain("Jobs prepared today: 0");
    expect(summary).toContain("Submitted or confirmed: 1");
    expect(summary).toContain("Pending questions: 3");
    expect(summary).toContain("Live Preflight");
    expect(summary).toContain("Status: PAUSE");
    expect(summary).toContain("Answer review: outputs/live-preflight/live-answer-prompts.html");
    expect(summary).toContain("Pending Questions");
    expect(summary).toContain("Should Product Manager at Global Enterprise Co count as target seniority?");
    expect(summary).toContain("Source Quality");
    expect(summary).toContain("Duplicates Blocked");
    expect(summary).toContain("Duplicates blocked this run: 2");
    expect(summary).toContain("Same company + similar role: 1");
    expect(summary).toContain("Already handled earlier: 1");
    expect(summary).toContain("Safety Blocks");
    expect(summary).toContain("Total safety blocks: 2");
    expect(summary).toContain("Fraud signals: 1");
    expect(summary).toContain("Blocked: Scam Co - Product Lead");
    expect(summary).toContain("Source Scorecards");
    expect(summary).toContain("JobSpy product search: 4/12 kept, 2 prepared, 33% kept rate, 1 positive");
    expect(summary).toContain("CV Quality");
    expect(summary).toContain("Minimum generated CV size: 4700 chars (65% of base CV)");
    expect(summary).toContain("Thinnest employer section: 3 bullet(s)");
    expect(summary).toContain("ATS Diagnostics");
    expect(summary).toContain("Missing supported JD terms: 1");
    expect(summary).toContain("Warning: Supported JD term is not visible");
    expect(summary).toContain("Scan History");
    expect(summary).toContain("Repeats skipped: 1");
    expect(summary).toContain("Repost signals: 1 cluster(s), 2 posting(s)");
    expect(summary).toContain("Possible repost: Example Fintech - Head of Product Growth");
    expect(summary).toContain("Recorded this run: 3");
    expect(summary).toContain("Source Learning");
    expect(summary).toContain("Positive outcomes: 1");
    expect(summary).toContain("JobSpy product search: 2 prepared, 1 replies, 1 interviews, 0 offers");
    expect(summary).toContain("Example Fintech - Head of Product");
    expect(summary).toContain("ATS diagnostics: outputs/ats-diagnostics/example.json");
    expect(summary).toContain("outputs/browser-receipts/example-receipt.json (Paused)");
    expect(summary).toContain("Skipped reason:");
    expect(summary).not.toContain("Promoted Fintech - Head of Product: Watch");
    expect(summary).toContain("Review one compensation question");
  });

  it("builds source outcome learning from applications, history, and event rows", () => {
    const eventRows = parseOutcomeEventsJsonLines([
      JSON.stringify({
        id: "event-reply",
        applicationId: "app-1",
        type: "reply",
        note: "Recruiter replied.",
        occurredAt: "2026-07-07T00:00:00.000Z"
      }),
      JSON.stringify({
        id: "event-rejection",
        applicationId: "app-2",
        type: "rejection",
        note: "Rejected.",
        occurredAt: "2026-07-08T00:00:00.000Z"
      }),
      "not-json"
    ].join("\n"));

    const summary = buildSourceOutcomeSummary({
      eventPath: "data/local/outcomes.jsonl",
      jobs: [
        {
          id: "job-1",
          source: {
            id: "jobspy-product",
            kind: "job_board",
            name: "JobSpy product search"
          },
          company: "Example Fintech",
          title: "Head of Product",
          url: "https://example.com/job-1",
          description: "Lead product strategy.",
          workMode: "remote",
          discoveredAt: "2026-07-06T00:00:00.000Z",
          liveState: "live"
        },
        {
          id: "job-2",
          source: {
            id: "remotive-product",
            kind: "job_board",
            name: "Remotive product search"
          },
          company: "Remote Product Co",
          title: "Product Strategy Lead",
          url: "https://example.com/job-2",
          description: "Lead product strategy.",
          workMode: "remote",
          discoveredAt: "2026-07-06T00:00:00.000Z",
          liveState: "live"
        }
      ],
      applications: [
        {
          id: "app-1",
          jobId: "job-1",
          status: "prepared",
          notes: [],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        },
        {
          id: "app-2",
          jobId: "job-2",
          status: "submitted",
          notes: [],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T12:00:00.000Z"
        }
      ],
      outcomeEvents: eventRows
    });

    expect(eventRows).toHaveLength(2);
    expect(summary.eventPath).toBe("data/local/outcomes.jsonl");
    expect(summary.trackedApplications).toBe(2);
    expect(summary.preparedApplications).toBe(2);
    expect(summary.submitted).toBe(2);
    expect(summary.replies).toBe(1);
    expect(summary.rejections).toBe(1);
    expect(summary.positiveOutcomes).toBe(1);
    expect(summary.sources[0]?.sourceName).toBe("JobSpy product search");
    expect(summary.sources[0]?.positiveOutcomes).toBe(1);
    expect(summary.sources[1]?.sourceName).toBe("Remotive product search");
    expect(summary.sources[1]?.rejections).toBe(1);
  });

  it("builds source scorecards from fetched, filtered, prepared, and outcome data", () => {
    const keptJob: Parameters<typeof buildSourceScorecardSummary>[0]["keptJobs"][number] = {
      id: "job-1",
      source: {
        id: "jobspy-product",
        kind: "job_board",
        name: "JobSpy product search"
      },
      company: "Example Fintech",
      title: "Head of Product",
      url: "https://example.com/job-1",
      description: "Lead product strategy.",
      workMode: "remote",
      discoveredAt: "2026-07-06T00:00:00.000Z",
      liveState: "live"
    };
    const filteredJob = {
      ...keptJob,
      id: "job-2",
      title: "Sales Manager",
      url: "https://example.com/job-2"
    };

    const scorecards = buildSourceScorecardSummary({
      applications: [
        {
          id: "app-1",
          jobId: "job-1",
          status: "submitted",
          notes: [],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T12:00:00.000Z"
        }
      ],
      fetchedJobs: [keptJob, filteredJob],
      filteredJobs: [filteredJob],
      jobs: [keptJob],
      keptJobs: [keptJob],
      outcomeEvents: [
        {
          id: "event-reply",
          applicationId: "app-1",
          type: "reply",
          note: "Recruiter replied.",
          occurredAt: "2026-07-07T00:00:00.000Z"
        }
      ]
    });

    expect(scorecards.fetchedJobs).toBe(2);
    expect(scorecards.keptJobs).toBe(1);
    expect(scorecards.filteredJobs).toBe(1);
    expect(scorecards.preparedApplications).toBe(1);
    expect(scorecards.replies).toBe(1);
    expect(scorecards.positiveOutcomes).toBe(1);
    expect(scorecards.sources[0]?.precision).toBe(0.5);
    expect(scorecards.sources[0]?.yield).toBe(0.5);
  });
});
