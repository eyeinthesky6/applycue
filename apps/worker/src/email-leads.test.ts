import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { importEmailLeads } from "./email-leads.js";

describe("importEmailLeads", () => {
  it("imports valid connector-extracted email leads and activates local job imports", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-leads-"));
    const configPath = path.join(root, "applycue.json");
    const inputPath = path.join(root, "email-leads.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({
      profile: {
        id: "email-user",
        name: "Email User",
        email: "email@example.com"
      },
      preferences: {
        targetRoleTerms: ["vp product"],
        targetIndustries: ["fintech"],
        preferredLocations: ["India"],
        employmentTypes: ["full_time"]
      },
      sourceSettings: {
        fraudSignalTerms: ["payment required", "profile database", "document before interview"]
      },
      sources: {
        localJobsPath: null
      }
    }), "utf8");
    await writeFile(inputPath, JSON.stringify([
      {
        messageId: "gmail-1",
        from: "jobs@example.com",
        subject: "VP Product opening at Razorpay",
        company: "Razorpay",
        title: "VP Product",
        url: "https://razorpay.com/jobs/vp-product",
        location: "Bengaluru, India",
        body: "Lead product strategy for payments."
      },
      {
        messageId: "gmail-2",
        subject: "Interesting opportunity",
        company: "Mystery Co",
        url: "https://example.com/job"
      },
      {
        messageId: "gmail-3",
        subject: "You are shortlisted",
        company: "Sketchy Recruiter",
        title: "VP Product",
        url: "https://sketchy.example/job",
        body: "Register your profile in our candidate database before we share the role."
      }
    ]), "utf8");

    const report = await importEmailLeads({
      configPath,
      inputPath,
      workspaceRoot: root
    });

    expect(report.importedCount).toBe(1);
    expect(report.skipped.map((item) => item.reason)).toEqual(["missing_title", "fraud_signal:profile database"]);
    expect(report.activatedLocalJobsPath).toBe(true);
    const updatedConfig = JSON.parse(await readFile(configPath, "utf8")) as { sources?: { localJobsPath?: string } };
    expect(updatedConfig.sources?.localJobsPath).toBe("assets/jobs");
    const rows = (await readFile(report.outputPath, "utf8")).trim().split(/\r?\n/).map((row) => JSON.parse(row));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company: "Razorpay",
      title: "VP Product",
      source: {
        kind: "email_alert",
        name: "User inbox job leads"
      }
    });

    const duplicateRun = await importEmailLeads({
      configPath,
      inputPath,
      workspaceRoot: root
    });

    expect(duplicateRun.importedCount).toBe(0);
    expect(duplicateRun.skipped.some((item) => item.reason === "duplicate_email_job")).toBe(true);
  });

  it("supports dry-run without writing jobs or activating config", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-leads-dry-"));
    const configPath = path.join(root, "applycue.json");
    const inputPath = path.join(root, "email-leads.jsonl");
    await writeFile(configPath, JSON.stringify({
      profile: {
        id: "email-dry-user",
        name: "Email Dry User"
      },
      preferences: {
        targetRoleTerms: ["head of product"]
      },
      sources: {
        localJobsPath: null
      }
    }), "utf8");
    await writeFile(inputPath, JSON.stringify({
      company: "Fintech Co",
      title: "Head of Product",
      url: "https://fintech.example/jobs/head-product",
      subject: "Head of Product"
    }), "utf8");

    const report = await importEmailLeads({
      configPath,
      dryRun: true,
      inputPath,
      workspaceRoot: root
    });

    expect(report.importedCount).toBe(1);
    expect(report.activatedLocalJobsPath).toBe(false);
    const config = JSON.parse(await readFile(configPath, "utf8")) as { sources?: { localJobsPath?: string | null } };
    expect(config.sources?.localJobsPath).toBeNull();
    await expect(readFile(report.outputPath, "utf8")).rejects.toThrow();
  });

  it("imports multi-row JSONL connector exports", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-leads-jsonl-"));
    const configPath = path.join(root, "applycue.json");
    const inputPath = path.join(root, "email-leads.jsonl");
    await writeFile(configPath, JSON.stringify({
      profile: {
        id: "email-jsonl-user",
        name: "Email JSONL User"
      },
      preferences: {
        targetRoleTerms: ["head of product"]
      },
      sources: {
        localJobsPath: null
      }
    }), "utf8");
    await writeFile(inputPath, [
      JSON.stringify({
        company: "Fintech One",
        title: "Head of Product",
        url: "https://fintech-one.example/jobs/head-product",
        subject: "Head of Product"
      }),
      JSON.stringify({
        company: "Fintech Two",
        title: "Director Product",
        url: "https://fintech-two.example/jobs/director-product",
        subject: "Director Product"
      })
    ].join("\n"), "utf8");

    const report = await importEmailLeads({
      configPath,
      inputPath,
      workspaceRoot: root
    });

    expect(report.importedCount).toBe(2);
    const rows = (await readFile(report.outputPath, "utf8")).trim().split(/\r?\n/).map((row) => JSON.parse(row));
    expect(rows.map((row) => row.company)).toEqual(["Fintech One", "Fintech Two"]);
  });
});
