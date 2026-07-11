import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Document, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { createProfileFromConfig, readBaseCvText } from "./index.js";

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

describe("readBaseCvText", () => {
  it("extracts the user's text from a real DOCX file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-docx-import-"));
    const filePath = path.join(dir, "candidate.docx");
    const document = new Document({
      sections: [{
        children: [
          new Paragraph("Candidate Name"),
          new Paragraph("Led fintech product strategy and roadmap delivery.")
        ]
      }]
    });
    await writeFile(filePath, await Packer.toBuffer(document));

    await expect(readBaseCvText(filePath)).resolves.toContain("Led fintech product strategy");
  });

  it("extracts text from a real text-based PDF file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-pdf-import-"));
    const filePath = path.join(dir, "candidate.pdf");
    await writeFile(filePath, createSimplePdf("Candidate CV PDF"));

    await expect(readBaseCvText(filePath)).resolves.toContain("Candidate CV PDF");
  });

  it("rejects image-only or empty PDFs instead of inventing CV text", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-empty-pdf-import-"));
    const filePath = path.join(dir, "candidate.pdf");
    await writeFile(filePath, createSimplePdf(""));

    await expect(readBaseCvText(filePath)).rejects.toThrow("may be image-only and need OCR");
  });
});

function createSimplePdf(text: string): Buffer {
  const escapedText = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
