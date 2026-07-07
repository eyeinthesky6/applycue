import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runApproveAnswers } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("runApproveAnswers from file", () => {
  it("saves only explicitly approved reusable answers from a live-preflight template", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-approve-answers-file-"));
    tempDirs.push(workspaceRoot);
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    const configPath = path.join(profileDir, "applycue.json");
    const templatePath = path.join(profileDir, "outputs", "live-preflight", "live-answer-approval-template.json");
    await mkdir(path.dirname(templatePath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Template Candidate",
          email: "template@example.com"
        },
        applicationAnswers: []
      }),
      "utf8"
    );
    await writeFile(
      templatePath,
      JSON.stringify({
        id: "applycue-live-answer-approval-template",
        sourceRef: "live-preflight:plan-1",
        reusableAnswers: [
          {
            approveForReuse: true,
            aliases: ["What is your notice period?"],
            field: "notice_period",
            question: "What is your notice period?",
            sourceRef: "live-preflight:plan-1",
            value: "30 days"
          },
          {
            approveForReuse: false,
            aliases: ["What is your desired salary?"],
            field: "expected_salary",
            question: "What is your desired salary?",
            sourceRef: "live-preflight:plan-1",
            value: "User answered but did not approve reuse"
          }
        ],
        oneOffAnswers: [
          {
            approveForReuse: true,
            field: "unlabeled_field",
            question: "Unlabeled field",
            sourceRef: "live-preflight:plan-1",
            value: "One-off value"
          }
        ]
      }),
      "utf8"
    );

    await runApproveAnswers([
      "--from-file",
      templatePath,
      "--applycue-home",
      applyCueHome,
      "--dry-run"
    ]);

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      profile: {
        name: "Template Candidate",
        email: "template@example.com"
      },
      applicationAnswers: []
    });

    await runApproveAnswers([
      "--from-file",
      templatePath,
      "--applycue-home",
      applyCueHome
    ]);

    const updated = JSON.parse(await readFile(configPath, "utf8")) as {
      applicationAnswers?: Array<Record<string, unknown>>;
    };
    expect(updated.applicationAnswers).toHaveLength(1);
    expect(updated.applicationAnswers?.[0]).toMatchObject({
      approvedByUser: true,
      field: "notice_period",
      value: "30 days",
      aliases: ["What is your notice period?"],
      sourceRef: "live-preflight:plan-1"
    });
  });

  it("accepts explicit set values against a live-preflight template without editing the template", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-approve-answers-set-"));
    tempDirs.push(workspaceRoot);
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    const configPath = path.join(profileDir, "applycue.json");
    const templatePath = path.join(profileDir, "outputs", "live-preflight", "live-answer-approval-template.json");
    await mkdir(path.dirname(templatePath), { recursive: true });
    const template = {
      id: "applycue-live-answer-approval-template",
      sourceRef: "live-preflight:plan-2",
      reusableAnswers: [
        {
          approveForReuse: false,
          aliases: ["What is your notice period?"],
          field: "notice_period",
          question: "What is your notice period?",
          sourceRef: "live-preflight:plan-2",
          value: ""
        },
        {
          approveForReuse: false,
          aliases: ["LinkedIn URL:"],
          field: "linkedin_url",
          question: "LinkedIn URL:",
          sourceRef: "live-preflight:plan-2",
          value: ""
        }
      ],
      oneOffAnswers: [
        {
          approveForReuse: false,
          field: "unlabeled_field",
          question: "Unlabeled field",
          sourceRef: "live-preflight:plan-2",
          value: ""
        }
      ]
    };
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Set Candidate",
          email: "set@example.com"
        },
        applicationAnswers: []
      }),
      "utf8"
    );
    await writeFile(templatePath, JSON.stringify(template), "utf8");

    await runApproveAnswers([
      "--from-file",
      templatePath,
      "--applycue-home",
      applyCueHome,
      "--set",
      "notice_period=30 days",
      "--set",
      "LinkedIn URL:=https://www.linkedin.com/in/set-candidate",
      "--dry-run"
    ]);

    expect(JSON.parse(await readFile(configPath, "utf8"))).toMatchObject({ applicationAnswers: [] });

    await runApproveAnswers([
      "--from-file",
      templatePath,
      "--applycue-home",
      applyCueHome,
      "--set",
      "notice_period=30 days",
      "--set",
      "LinkedIn URL:=https://www.linkedin.com/in/set-candidate"
    ]);

    const updated = JSON.parse(await readFile(configPath, "utf8")) as {
      applicationAnswers?: Array<Record<string, unknown>>;
    };
    expect(updated.applicationAnswers).toHaveLength(2);
    expect(updated.applicationAnswers?.[0]).toMatchObject({
      field: "notice_period",
      value: "30 days",
      aliases: ["What is your notice period?"],
      sourceRef: "live-preflight:plan-2"
    });
    expect(updated.applicationAnswers?.[1]).toMatchObject({
      field: "linkedin_url",
      value: "https://www.linkedin.com/in/set-candidate",
      aliases: ["LinkedIn URL:"],
      sourceRef: "live-preflight:plan-2"
    });
    expect(JSON.parse(await readFile(templatePath, "utf8"))).toEqual(template);
  });

  it("can read the latest live template from the active profile", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-approve-answers-live-"));
    tempDirs.push(workspaceRoot);
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    const templatePath = path.join(profileDir, "outputs", "live-preflight", "live-answer-approval-template.json");
    await mkdir(path.dirname(templatePath), { recursive: true });
    const configPath = path.join(profileDir, "applycue.json");
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Live Candidate",
          email: "live@example.com"
        },
        applicationAnswers: []
      }),
      "utf8"
    );
    await writeFile(
      templatePath,
      JSON.stringify({
        id: "applycue-live-answer-approval-template",
        sourceRef: "live-preflight:plan-3",
        reusableAnswers: [
          {
            approveForReuse: false,
            aliases: ["What is your desired salary?"],
            field: "expected_salary",
            question: "What is your desired salary?",
            sourceRef: "live-preflight:plan-3",
            value: ""
          }
        ],
        oneOffAnswers: []
      }),
      "utf8"
    );

    await runApproveAnswers([
      "--from-live",
      "--applycue-home",
      applyCueHome,
      "--set",
      "expected_salary=INR 7500000"
    ]);

    const updated = JSON.parse(await readFile(configPath, "utf8")) as {
      applicationAnswers?: Array<Record<string, unknown>>;
    };
    expect(updated.applicationAnswers).toHaveLength(1);
    expect(updated.applicationAnswers?.[0]).toMatchObject({
      field: "expected_salary",
      value: "INR 7500000",
      aliases: ["What is your desired salary?"],
      sourceRef: "live-preflight:plan-3"
    });
  });
});
