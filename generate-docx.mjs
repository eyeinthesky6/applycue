#!/usr/bin/env node

/** Generate a simple, single-column ATS-friendly DOCX from a tailored CV Markdown file. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import yaml from 'js-yaml';

export const CV_SOURCE_SCHEMA = 'applycue-cv-source-v1';

function normalizedIdentity(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function parseApplyCueCvMetadata(markdown, { required = false } = {}) {
  const text = String(markdown || '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) {
    if (required) throw new Error('Tailored CV Markdown needs ApplyCue job metadata frontmatter');
    return null;
  }
  let parsed;
  try { parsed = yaml.load(match[1]); }
  catch (error) { throw new Error(`Invalid tailored CV metadata: ${error.message}`); }
  const metadata = parsed?.applycue;
  if (!metadata) {
    if (required) throw new Error('Tailored CV frontmatter is missing the applycue metadata block');
    return null;
  }
  if (metadata.schemaVersion !== CV_SOURCE_SCHEMA) throw new Error(`Unsupported tailored CV metadata schema: ${metadata.schemaVersion || 'missing'}`);
  const result = {
    schemaVersion: metadata.schemaVersion,
    jobId: normalizedIdentity(metadata.jobId),
    company: normalizedIdentity(metadata.company),
    role: normalizedIdentity(metadata.role),
    jobUrl: normalizedIdentity(metadata.jobUrl),
    decision: normalizedIdentity(metadata.decision).toLowerCase(),
    reviewReceiptId: normalizedIdentity(metadata.reviewReceiptId),
    decisionContextFingerprint: normalizedIdentity(metadata.decisionContextFingerprint).toLowerCase(),
    jdContentFingerprint: normalizedIdentity(metadata.jdContentFingerprint).toLowerCase(),
  };
  if (!/^\d+$/.test(result.jobId)) throw new Error('Tailored CV metadata needs a numeric jobId');
  if (!result.company || !result.role) throw new Error('Tailored CV metadata needs company and role');
  if (!/^https?:\/\//i.test(result.jobUrl)) throw new Error('Tailored CV metadata needs an http(s) jobUrl');
  if (result.decision !== 'apply') throw new Error('A tailored application CV must reference an apply decision');
  if (!result.reviewReceiptId) throw new Error('Tailored CV metadata needs the current reviewReceiptId');
  if (!/^[a-f0-9]{64}$/.test(result.decisionContextFingerprint)) throw new Error('Tailored CV metadata needs a SHA-256 decisionContextFingerprint');
  if (!/^[a-f0-9]{64}$/.test(result.jdContentFingerprint)) throw new Error('Tailored CV metadata needs a SHA-256 jdContentFingerprint');
  return result;
}

export function stripApplyCueCvFrontmatter(markdown) {
  const text = String(markdown || '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/);
  return match ? text.slice(match[0].length) : text;
}

export function formatApplyCueCvFrontmatter(metadata) {
  const checked = parseApplyCueCvMetadata(`---\n${yaml.dump({ applycue: metadata }, { noRefs: true, sortKeys: true, lineWidth: -1 }).trim()}\n---\n`, { required: true });
  return `---\n${yaml.dump({ applycue: checked }, { noRefs: true, sortKeys: true, lineWidth: -1 }).trim()}\n---\n`;
}

export function normalizeCvTextForAts(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\u2026/g, '...')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s*\u2192\s*/g, ' to ')
    .replace(/\s*\u2190\s*/g, ' from ')
    .replace(/\s*[\u2191\u2193]\s*/g, ' ')
    .replace(/\s*[\u00B7\u2022]\s*/g, ' | ')
    .replace(/\u20B9/g, 'Rs ')
    .replace(/\u20AC/g, 'EUR ')
    .replace(/\u00A3/g, 'GBP ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textRun(text, options = {}) {
  return new TextRun({ text: normalizeCvTextForAts(text), size: 21, font: 'Arial', ...options });
}

export function markdownToDocxParagraphs(markdown) {
  const paragraphs = [];
  for (const rawLine of stripApplyCueCvFrontmatter(markdown).split(/\r\n|\n|\r/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^-{3,}$/.test(trimmed)) continue;
    if (trimmed.startsWith('# ')) {
      paragraphs.push(new Paragraph({ children: [textRun(trimmed.slice(2), { bold: true, size: 32 })], spacing: { after: 140 } }));
      continue;
    }
    if (trimmed.startsWith('## ')) {
      paragraphs.push(new Paragraph({ children: [textRun(trimmed.slice(3).toUpperCase(), { bold: true, color: '1D6F7A', size: 22 })], heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
      continue;
    }
    if (trimmed.startsWith('### ')) {
      paragraphs.push(new Paragraph({ children: [textRun(trimmed.slice(4), { bold: true })], heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 40 } }));
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({ children: [textRun(trimmed.replace(/^[-*]\s+/, ''))], bullet: { level: 0 }, spacing: { after: 40 } }));
      continue;
    }
    paragraphs.push(new Paragraph({ children: [textRun(trimmed)], spacing: { after: 80 } }));
  }
  return paragraphs;
}

export async function renderAtsDocx(markdown) {
  const metadata = parseApplyCueCvMetadata(markdown);
  const candidateName = stripApplyCueCvFrontmatter(markdown).match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Candidate';
  const tailoredTitle = metadata ? `${candidateName} - ${metadata.company} ${metadata.role} CV` : 'ApplyCue tailored CV';
  const tailoredDescription = metadata
    ? `ApplyCue job ${metadata.jobId}; review receipt ${metadata.reviewReceiptId}; decision context ${metadata.decisionContextFingerprint}; JD ${metadata.jdContentFingerprint}; ${metadata.jobUrl}`
    : 'Single-column ATS-friendly CV generated by ApplyCue.';
  const document = new Document({
    creator: 'ApplyCue',
    title: tailoredTitle,
    subject: metadata ? `${metadata.company} - ${metadata.role}` : 'Tailored CV',
    description: tailoredDescription,
    keywords: metadata ? `ApplyCue, job ${metadata.jobId}, ${metadata.company}, ${metadata.role}` : 'ApplyCue, ATS CV',
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: markdownToDocxParagraphs(markdown)
    }]
  });
  return Packer.toBuffer(document);
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg || !outputArg) {
    console.error('Usage: node generate-docx.mjs <tailored-cv.md> <output.docx>');
    process.exit(1);
  }
  const input = resolve(inputArg);
  const output = resolve(outputArg);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, await renderAtsDocx(readFileSync(input, 'utf8')));
  console.log(`Generated ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
