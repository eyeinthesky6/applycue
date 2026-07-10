import type { ApplicationDraft, UserProfile } from "@applycue/core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeMasterFormDataReport } from "./master-form-data.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("master form data", () => {
  it("writes a reviewable master form data snapshot without final submit policy text", async () => {
    const outputRoot = await tempOutputRoot();

    const report = await writeMasterFormDataReport({
      drafts: [draftFixture()],
      outputRoot
    });

    expect(report.status).toBe("needs_confirmation");
    expect(report.fieldCount).toBe(3);
    expect(report.fields.map((field) => field.field)).toEqual(["email", "name", "notice_period"]);
    const preview = await readFile(report.paths.markdownPreview, "utf8");
    expect(preview).toContain("| Field | Value | Aliases | Needs Approval | Source |");
    expect(preview).toContain("Sample Candidate");
    expect(preview).toContain("30 days");
    expect(preview).not.toContain("Pause before submit");
    expect(await readFile(report.paths.canonicalJson, "utf8")).toContain("applycue-master-form-data");
  });

  it("includes approved reusable profile answers even when no current draft uses them", async () => {
    const outputRoot = await tempOutputRoot();

    const report = await writeMasterFormDataReport({
      drafts: [],
      outputRoot,
      profile: {
        applicationAnswers: [
          {
            id: "answer-notice-period",
            field: "notice_period",
            value: "30 days",
            approvedByUser: true,
            aliases: ["When can you join?"],
            sourceRef: "user-confirmed",
            createdAt: "2026-07-06T00:00:00.000Z"
          }
        ]
      } as UserProfile
    });

    expect(report.fieldCount).toBe(1);
    expect(report.fields[0]).toMatchObject({
      field: "notice_period",
      value: "30 days",
      aliases: ["When can you join?"],
      sourceRefs: ["user-confirmed"]
    });
    expect(await readFile(report.paths.markdownPreview, "utf8")).toContain("When can you join?");
  });

  it("preserves confirmation while the form values are unchanged", async () => {
    const outputRoot = await tempOutputRoot();
    const draft = draftFixture();

    const confirmed = await writeMasterFormDataReport({ drafts: [draft], outputRoot }, { confirm: true });
    const rechecked = await writeMasterFormDataReport({ drafts: [draft], outputRoot });

    expect(confirmed.status).toBe("confirmed");
    expect(rechecked.status).toBe("confirmed");
    expect(rechecked.confirmedAt).toBe(confirmed.confirmedAt);
  });

  it("requires fresh confirmation when a reused value changes", async () => {
    const outputRoot = await tempOutputRoot();
    await writeMasterFormDataReport({ drafts: [draftFixture()], outputRoot }, { confirm: true });
    const changed = draftFixture("45 days");

    const rechecked = await writeMasterFormDataReport({ drafts: [changed], outputRoot });

    expect(rechecked.status).toBe("needs_confirmation");
  });

  it("prints a profile-aware confirmation command", async () => {
    const outputRoot = await tempOutputRoot();

    const report = await writeMasterFormDataReport(
      { drafts: [draftFixture()], outputRoot },
      { confirmationCommand: "pnpm applycue:form-data -- --confirm --profile anita-sharma --more-results --target-ranking-queue 200" }
    );

    expect(report.confirmationCommand).toBe(
      "pnpm applycue:form-data -- --confirm --profile anita-sharma --more-results --target-ranking-queue 200"
    );
    expect(await readFile(report.paths.markdownPreview, "utf8")).toContain("--profile anita-sharma");
  });
});

async function tempOutputRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "applycue-master-form-data-test-"));
  tempDirs.push(root);
  return root;
}

function draftFixture(noticePeriod = "30 days"): ApplicationDraft {
  return {
    jobId: "job-1",
    cvVariantId: "cv-1",
    answers: [
      {
        field: "name",
        value: "Sample Candidate",
        needsApproval: false,
        aliases: ["Full name"],
        sourceRef: "profile.contact.name"
      },
      {
        field: "email",
        value: "sample@example.com",
        needsApproval: false,
        aliases: ["Email address"],
        sourceRef: "profile.contact.email"
      },
      {
        field: "notice_period",
        value: noticePeriod,
        needsApproval: false,
        aliases: ["What is your notice period?"],
        sourceRef: "applicationAnswers.notice_period"
      },
      {
        field: "final_submit",
        value: "Pause before submit.",
        needsApproval: true,
        sourceRef: "applySettings"
      }
    ],
    submitRequiresApproval: true,
    canAutoSubmit: false,
    applyMode: "review",
    pauseReasons: ["missing_required_answer"]
  };
}
