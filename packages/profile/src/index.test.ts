import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProfileFromConfig } from "./index.js";

describe("createProfileFromConfig", () => {
  it("creates a user profile from local config and base CV text", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-profile-"));
    const baseCvPath = path.join(dir, "base-cv.md");
    await writeFile(baseCvPath, "Base CV: AI transformation and fintech strategy.", "utf8");

    const profile = await createProfileFromConfig(
      {
        profile: {
          name: "Local Candidate",
          email: "local@example.com",
          phone: "+91 99999 00000",
          location: "Delhi NCR",
          links: ["https://www.linkedin.com/in/local-candidate"],
          activeBaseCvId: "base-product",
          currentCompany: "CurrentCo",
          currentDesignation: "Head of AI Transformation",
          currentLocation: "Delhi NCR",
          applyToPastEmployers: false
        },
        baseCvs: [
          {
            id: "base-product",
            label: "Product base CV",
            kind: "user_role_cv",
            status: "active",
            version: "2026-07-06",
            path: baseCvPath,
            roleFamilyTerms: ["product", "ai transformation"],
            createdAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:00:00.000Z"
          }
        ],
        assets: [
          {
            id: "asset-profile-image",
            label: "Profile image",
            kind: "profile_image",
            path: "assets/images/profile.jpg",
            contentType: "image/jpeg",
            createdAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:00:00.000Z"
          }
        ],
        preferences: {
          targetRoleTerms: ["ai transformation"]
        },
        proofBank: [
          {
            id: "proof-ai",
            claim: "Led AI transformation work.",
            evidence: "Base CV includes AI transformation work.",
            tags: ["ai", "transformation"],
            kind: "work"
          }
        ],
        applicationAnswers: [
          {
            id: "answer-notice-period",
            field: "notice_period",
            value: "30 days",
            approvedByUser: true,
            aliases: ["What is your notice period?", "Notice period"],
            sourceRef: "user-confirmed",
            createdAt: "2026-07-06T00:00:00.000Z"
          },
          {
            id: "answer-unapproved",
            field: "current_salary",
            value: "Example value",
            approvedByUser: false,
            createdAt: "2026-07-06T00:00:00.000Z"
          }
        ]
      },
      dir
    );

    expect(profile.name).toBe("Local Candidate");
    expect(profile.contact?.email).toBe("local@example.com");
    expect(profile.baseCvText).toContain("AI transformation");
    expect(profile.activeBaseCvId).toBe("base-product");
    expect(profile.baseCvSources).toHaveLength(1);
    expect(profile.assets?.[0]?.kind).toBe("profile_image");
    expect(profile.preferences.targetRoleTerms).toEqual(["ai transformation"]);
    expect(profile.facts?.some((fact) => fact.id === "profile-current-designation")).toBe(true);
    expect(profile.applicationAnswers).toHaveLength(1);
    expect(profile.applicationAnswers?.[0]?.field).toBe("notice_period");
    expect(profile.applicationAnswers?.[0]?.aliases).toContain("What is your notice period?");
  });
});
