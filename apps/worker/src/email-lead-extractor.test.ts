import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractEmailLeads } from "./email-lead-extractor.js";

describe("extractEmailLeads", () => {
  it("extracts IIMJobs markdown job cards and skips non-job links", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-extract-iimjobs-"));
    const configPath = await writeConfig(root);
    const inputPath = path.join(root, "gmail-raw.json");
    const outputPath = path.join(root, "extracted.jsonl");
    await writeFile(inputPath, JSON.stringify({
      messages: [
        {
          id: "gmail-iimjobs-1",
          from: "alerts@iimjobs.com",
          subject: "Product and strategy roles for you",
          date: "2026-07-09T07:00:00.000Z",
          body: [
            "[Product Director - Generative AI \u2606\n\nEmployee Forums \u00b7 12-18 Yrs \u00b7 Mumbai/Gurgaon/Gurugram/Bangalore](https://postoffice.iimjobs.com/click?u=https:%2F%2Fwww.iimjobs.com%2Fj%2Fproduct-director-generative-ai-employee-forums-1001.html)",
            "[Executive MBA Course](https://www.iimjobs.com/course/executive-mba)",
            "[Open app](https://play.google.com/store/apps/details?id=iimjobs)"
          ].join("\n\n")
        }
      ]
    }), "utf8");

    const report = await extractEmailLeads({ configPath, inputPath, outputPath, workspaceRoot: root });

    expect(report.extractedCount).toBe(1);
    const leads = await readJsonl(outputPath);
    const [lead] = leads;
    expect(lead).toBeDefined();
    expect(lead).toMatchObject({
      company: "Employee Forums",
      from: "alerts@iimjobs.com",
      location: "Mumbai/Gurgaon/Gurugram/Bangalore",
      postedAt: "2026-07-09T07:00:00.000Z",
      sourceName: "Gmail job alert - iimjobs",
      title: "Product Director - Generative AI"
    });
    expect(String(lead?.url)).toContain("https://www.iimjobs.com/j/product-director-generative-ai");
  });

  it("extracts normal Naukri alert rows and unwraps redirect URLs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-extract-naukri-"));
    const configPath = await writeConfig(root);
    const inputPath = path.join(root, "gmail-raw.jsonl");
    const outputPath = path.join(root, "extracted.jsonl");
    await writeFile(inputPath, JSON.stringify({
      id: "gmail-naukri-1",
      from_: "jobs@naukri.com",
      subject: "Head of Corporate Payments jobs",
      body: [
        "[Head of Corporate Payments\n\nMichael Page\n\nNoida, Pune, Gurugram\n\nApply](https://www.naukri.com/jd/job-listings-head-of-corporate-payments?redirect=https%3A%2F%2Fwww.naukri.com%2Fjd%2Fjob-listings-head-of-corporate-payments-michael-page-noida-pune-gurugram-120726001234)"
      ].join("\n")
    }), "utf8");

    const report = await extractEmailLeads({ configPath, inputPath, outputPath, workspaceRoot: root });

    expect(report.extractedCount).toBe(1);
    const [lead] = await readJsonl(outputPath);
    expect(lead).toMatchObject({
      company: "Michael Page",
      location: "Noida, Pune, Gurugram",
      sourceName: "Gmail job alert - Naukri",
      title: "Head of Corporate Payments",
      url: "https://www.naukri.com/jd/job-listings-head-of-corporate-payments-michael-page-noida-pune-gurugram-120726001234"
    });
  });

  it("extracts generic apply links from nearby email context", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-extract-context-"));
    const configPath = await writeConfig(root);
    const inputPath = path.join(root, "gmail-raw.json");
    const outputPath = path.join(root, "extracted.jsonl");
    await writeFile(inputPath, JSON.stringify({
      data: [
        {
          id: "gmail-context-1",
          from: "alerts@naukri.com",
          subject: "TopTier job alert",
          body: [
            "Acme Payments",
            "4.2",
            "VP Product - Payments",
            "Bengaluru",
            "12-18 Yrs",
            "[View & apply](https://www.naukri.com/jd/job-listings-vp-product-payments-acme-payments-bengaluru-120726009999)"
          ].join("\n")
        }
      ]
    }), "utf8");

    const report = await extractEmailLeads({ configPath, inputPath, outputPath, workspaceRoot: root });

    expect(report.extractedCount).toBe(1);
    const [lead] = await readJsonl(outputPath);
    expect(lead).toMatchObject({
      company: "Acme Payments",
      location: "Bengaluru",
      title: "VP Product - Payments"
    });
  });

  it("extracts HTML anchor links from connector bodies", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-extract-html-"));
    const configPath = await writeConfig(root);
    const inputPath = path.join(root, "gmail-raw.json");
    const outputPath = path.join(root, "extracted.jsonl");
    await writeFile(inputPath, JSON.stringify({
      messages: [
        {
          id: "gmail-html-1",
          from: "jobs@naukri.com",
          subject: "Director Product jobs",
          body: "<a href=\"https://www.naukri.com/jd/job-listings-director-product-fintech-html-pune-120726001222\">Director Product<br>Fintech HTML<br>Pune<br>Apply</a>"
        }
      ]
    }), "utf8");

    const report = await extractEmailLeads({ configPath, inputPath, outputPath, workspaceRoot: root });

    expect(report.extractedCount).toBe(1);
    const [lead] = await readJsonl(outputPath);
    expect(lead).toMatchObject({
      company: "Fintech HTML",
      location: "Pune",
      title: "Director Product"
    });
  });

  it("does not import vague profile-update emails as jobs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-extract-profile-"));
    const configPath = await writeConfig(root);
    const inputPath = path.join(root, "gmail-raw.json");
    const outputPath = path.join(root, "extracted.jsonl");
    await writeFile(inputPath, JSON.stringify({
      messages: [
        {
          id: "gmail-profile-1",
          from: "info@shine.com",
          subject: "Confirm Your Profile Details",
          body: "You are shortlisted. [Confirm profile](https://shine.example/profile?candidate=123) before we share the role."
        }
      ]
    }), "utf8");

    const report = await extractEmailLeads({ configPath, inputPath, outputPath, workspaceRoot: root });

    expect(report.extractedCount).toBe(0);
    expect(await readFile(outputPath, "utf8")).toBe("");
  });

  it("can import extracted leads into the normal local job source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "applycue-email-extract-import-"));
    const configPath = await writeConfig(root);
    const inputPath = path.join(root, "gmail-raw.json");
    const outputPath = path.join(root, "extracted.jsonl");
    await writeFile(inputPath, JSON.stringify({
      messages: [
        {
          id: "gmail-import-1",
          from: "jobs@naukri.com",
          subject: "Head of Product jobs",
          body: "[Head of Product\n\nFintech One\n\nMumbai\n\nApply](https://www.naukri.com/jd/job-listings-head-of-product-fintech-one-mumbai-120726001111)"
        }
      ]
    }), "utf8");

    const report = await extractEmailLeads({
      configPath,
      importLeads: true,
      inputPath,
      outputPath,
      workspaceRoot: root
    });

    expect(report.importReport?.importedCount).toBe(1);
    const importedRows = await readJsonl(report.importReport?.outputPath ?? "");
    expect(importedRows[0]).toMatchObject({
      company: "Fintech One",
      title: "Head of Product",
      source: {
        kind: "email_alert"
      }
    });
  });
});

async function writeConfig(root: string): Promise<string> {
  const configPath = path.join(root, "applycue.json");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    profile: {
      id: "email-extract-user",
      name: "Email Extract User",
      email: "email@example.com"
    },
    preferences: {
      targetRoleTerms: ["head of product", "vp product", "product director"],
      targetIndustries: ["fintech", "payments", "ai"],
      preferredLocations: ["India"]
    },
    sourceSettings: {
      fraudSignalTerms: ["registration fee", "profile database", "payment before interview"]
    },
    sources: {
      localJobsPath: null
    }
  }), "utf8");
  return configPath;
}

async function readJsonl(filePath: string): Promise<Array<Record<string, unknown>>> {
  const content = await readFile(filePath, "utf8");
  return content.trim() ? content.trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
}
