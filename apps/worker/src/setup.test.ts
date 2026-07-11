import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readApplyCueStatus } from "./status.js";
import { selectCleanStarterSourceIds, setupApplyCue } from "./setup.js";

const suggestions = [
  {
    id: "jobspy-primary",
    kind: "job_board" as const,
    label: "JobSpy board search",
    provider: "jobspy"
  },
  {
    id: "jobspy-targeted",
    kind: "job_board" as const,
    label: "JobSpy targeted search - product",
    provider: "jobspy"
  },
  {
    id: "jobspy-extra",
    kind: "job_board" as const,
    label: "JobSpy targeted search - strategy",
    provider: "jobspy"
  },
  {
    id: "themuse",
    kind: "job_board" as const,
    label: "The Muse job board",
    provider: "themuse"
  },
  {
    id: "remotive",
    kind: "job_board" as const,
    label: "Remotive remote search",
    provider: "remotive"
  },
  {
    id: "remoteok",
    kind: "job_board" as const,
    label: "RemoteOK remote board",
    provider: "remoteok"
  },
  {
    id: "browser-source",
    kind: "job_board" as const,
    label: "Logged-in board",
    provider: "browser",
    requiresBrowser: true,
    requiresLogin: true
  }
];

describe("selectCleanStarterSourceIds", () => {
  it("keeps JobSpy bounded and adds one independent structured fallback", () => {
    expect(selectCleanStarterSourceIds(suggestions, "ready")).toEqual([
      "jobspy-primary",
      "jobspy-targeted",
      "remotive"
    ]);
  });

  it.each(["skipped", "failed"] as const)("uses structured no-key sources when JobSpy is %s", (status) => {
    expect(selectCleanStarterSourceIds(suggestions, status)).toEqual(["remotive", "remoteok"]);
  });
});

describe("setupApplyCue", () => {
  it("creates a profile skeleton without claiming an empty first run is complete", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-setup-empty-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");

    const result = await setupApplyCue({
      applyCueHome,
      autoApproveSources: false,
      installTools: false,
      workspaceRoot
    });

    expect(result.setupStatus).toBe("needs_profile");
    expect(result.missingProfileFields).toEqual(["user identity/contact", "base CV", "target roles"]);
    expect(result.runManifestPath).toBeUndefined();
    await expect(access(path.join(result.profileDir, "outputs", "runs", "local-first-build.json"))).rejects.toThrow();

    const status = await readApplyCueStatus({ applyCueHome });
    expect(status.status).toBe("needs_profile");
  });

  it("imports an existing config-shaped setup packet and base CV into the user store", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-setup-ready-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const inputPath = path.join(workspaceRoot, "approved-setup.json");
    const sourceCvPath = path.join(workspaceRoot, "candidate-cv.txt");
    await writeFile(sourceCvPath, "Candidate CV\n\nExample Bank - Head of Product\nLed fintech product strategy and roadmap delivery.", "utf8");
    await writeFile(inputPath, JSON.stringify({
      profile: {
        id: "setup-candidate",
        name: "Setup Candidate",
        email: "setup@example.com",
        currentCountry: "India"
      },
      preferences: {
        targetRoleTerms: ["head of product"],
        preferredLocations: ["India"]
      },
      applySettings: {
        mode: "review",
        applicationsPerDay: 5
      }
    }), "utf8");

    const result = await setupApplyCue({
      applyCueHome,
      autoApproveSources: false,
      baseCvPath: sourceCvPath,
      installTools: false,
      profileInputPath: inputPath,
      workspaceRoot
    });

    expect(result.setupStatus).toBe("ready");
    expect(result.missingProfileFields).toEqual([]);
    expect(result.runManifestPath).toBeTruthy();
    await expect(access(result.runManifestPath!)).resolves.toBeUndefined();

    const config = JSON.parse(await readFile(result.configPath, "utf8")) as {
      profile?: { baseCvPath?: string; email?: string; name?: string };
      preferences?: { targetRoleTerms?: string[] };
    };
    expect(config.profile).toMatchObject({
      baseCvPath: "assets/base-cvs/candidate-cv.txt",
      email: "setup@example.com",
      name: "Setup Candidate"
    });
    expect(config.preferences?.targetRoleTerms).toEqual(["head of product"]);
    expect(await readFile(path.join(result.profileDir, "assets", "base-cvs", "candidate-cv.txt"), "utf8"))
      .toContain("Led fintech product strategy");

    const status = await readApplyCueStatus({ applyCueHome });
    expect(status.status).not.toBe("needs_setup");
    expect(status.status).not.toBe("needs_profile");
  });

  it("can validate a complete setup without refreshing the normal preparation batch", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-setup-validate-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const inputPath = path.join(workspaceRoot, "approved-setup.json");
    const sourceCvPath = path.join(workspaceRoot, "candidate-cv.txt");
    await writeFile(sourceCvPath, "Candidate CV\n\nLed product strategy.", "utf8");
    await writeFile(inputPath, JSON.stringify({
      profile: { name: "Validation Candidate", email: "validation@example.com" },
      preferences: { targetRoleTerms: ["head of product"] }
    }), "utf8");

    const result = await setupApplyCue({
      applyCueHome,
      autoApproveSources: false,
      baseCvPath: sourceCvPath,
      installTools: false,
      profileInputPath: inputPath,
      runFirstBatch: false,
      workspaceRoot
    });

    expect(result.setupStatus).toBe("ready");
    expect(result.runManifestPath).toBeUndefined();
    expect(result.notes).toContain("Validated profile and local tools without running or refreshing the normal preparation batch.");
    await expect(access(path.join(result.profileDir, "outputs", "runs", "local-first-build.json"))).rejects.toThrow();
  });

  it("rejects a corrupt DOCX rather than asking the agent to recreate its text", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-setup-binary-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const sourceCvPath = path.join(workspaceRoot, "candidate.docx");
    await writeFile(sourceCvPath, "not-a-real-docx", "utf8");

    await expect(setupApplyCue({
      applyCueHome,
      baseCvPath: sourceCvPath,
      installTools: false,
      workspaceRoot
    })).rejects.toThrow("Could not extract text from DOCX base CV");
  });

  it("keeps agent-led setup imports separated by profile key", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-setup-profiles-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");

    for (const profileKey of ["candidate-a", "candidate-b"]) {
      const inputPath = path.join(workspaceRoot, `${profileKey}.json`);
      const sourceCvPath = path.join(workspaceRoot, `${profileKey}.txt`);
      await writeFile(sourceCvPath, `${profileKey} CV\nProduct leadership evidence.`, "utf8");
      await writeFile(inputPath, JSON.stringify({
        profile: { name: profileKey, email: `${profileKey}@example.com` },
        preferences: { targetRoleTerms: [`${profileKey} target role`] }
      }), "utf8");
      const result = await setupApplyCue({
        applyCueHome,
        autoApproveSources: false,
        baseCvPath: sourceCvPath,
        installTools: false,
        profileInputPath: inputPath,
        profileKey,
        workspaceRoot
      });
      expect(result.setupStatus).toBe("ready");
    }

    const configA = JSON.parse(await readFile(
      path.join(applyCueHome, "profiles", "candidate-a", "applycue.json"),
      "utf8"
    )) as { profile?: { name?: string } };
    const configB = JSON.parse(await readFile(
      path.join(applyCueHome, "profiles", "candidate-b", "applycue.json"),
      "utf8"
    )) as { profile?: { name?: string } };
    expect(configA.profile?.name).toBe("candidate-a");
    expect(configB.profile?.name).toBe("candidate-b");
    await expect(access(path.join(
      applyCueHome,
      "profiles",
      "candidate-a",
      "assets",
      "base-cvs",
      "candidate-b.txt"
    ))).rejects.toThrow();
  });
});
