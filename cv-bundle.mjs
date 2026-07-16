#!/usr/bin/env node

/**
 * Fingerprint-bound CV bundle records.
 *
 * The external agent writes the tailored CV. This module proves that the
 * selected Markdown, HTML, PDF and DOCX belong to the same tracker job and
 * current review, still open, and have not changed since approval.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { parseApplyCueCvMetadata, stripApplyCueCvFrontmatter } from './generate-docx.mjs';
import { parseJdCaptureFile, reviewFreshnessForJob } from './review-evidence.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const CV_BUNDLE_SCHEMA = 'applycue-cv-bundle-v1';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function stableHash(value) {
  return sha256(stableJson(value));
}

function normalizedText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}

function identityKey(value) {
  return normalizedText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function sameIdentity(left, right) {
  return identityKey(left) === identityKey(right);
}

function identityContains(value, expected) {
  return identityKey(value).includes(identityKey(expected));
}

function canonicalUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Job URL must use http or https');
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

function repoRelative(root, target) {
  const rel = relative(root, resolve(target));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return '';
  return rel.split(sep).join('/');
}

function resolveOutputArtifact(root, value, extension) {
  const full = resolve(root, String(value || ''));
  const rel = repoRelative(root, full);
  if (!rel || !rel.startsWith('output/')) throw new Error(`CV artifact must stay under output/: ${value}`);
  if (extname(full).toLowerCase() !== extension) throw new Error(`Expected a ${extension} artifact: ${value}`);
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`CV artifact is missing: ${rel}`);
  return { full, path: rel };
}

function indexPath(root, explicit = '') {
  return explicit ? resolve(explicit) : join(root, 'data', 'pdf-index.tsv');
}

function normalizeReportNumber(value) {
  return String(value || '').trim().replace(/^0+(?=\d)/, '');
}

function readIndexRows(root, explicit = '') {
  const path = indexPath(root, explicit);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#')).map((line) => {
    const [report = '', pdf = '', html = '', format = '', date = '', manifestJson = ''] = line.split('\t');
    let manifest = null;
    if (manifestJson) {
      try { manifest = JSON.parse(manifestJson); } catch { manifest = { invalidJson: true }; }
    }
    return { report, pdf, html, format, date, manifest, raw: line };
  });
}

function writeIndexRows(root, rows, explicit = '') {
  const path = indexPath(root, explicit);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp,
    '# report\tpdf\thtml\tformat\tdate\tbundle_json — written by ApplyCue generators; do not edit\n' +
    `${rows.map((row) => row.raw).join('\n')}\n`,
    'utf8');
  renameSync(temp, path);
}

export function readCvBundleManifests(root = ROOT, explicitIndexPath = '') {
  return readIndexRows(root, explicitIndexPath)
    .map((row) => row.manifest)
    .filter((manifest) => manifest && !manifest.invalidJson);
}

export function latestCvBundleManifest(root = ROOT, jobId, explicitIndexPath = '') {
  return readCvBundleManifests(root, explicitIndexPath)
    .filter((manifest) => String(manifest.jobId) === String(jobId)).at(-1) || null;
}

function reportUrl(root, reportPath) {
  const full = resolve(root, reportPath);
  if (!existsSync(full)) throw new Error(`Review report is missing: ${reportPath}`);
  const text = readFileSync(full, 'utf8');
  const url = text.match(/^\*\*URL:\*\*\s*(https?:\/\/\S+)/im)?.[1] || '';
  if (!url) throw new Error(`Review report has no URL: ${reportPath}`);
  return canonicalUrl(url);
}

function htmlMeta(html) {
  const values = new Map();
  for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
    const attrs = new Map();
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)) attrs.set(match[1].toLowerCase(), match[3]);
    if (attrs.get('name')) values.set(attrs.get('name').toLowerCase(), attrs.get('content') || '');
  }
  return values;
}

function decodeMarkupEntities(value) {
  const entities = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  };
  return String(value || '').replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (entity, name) => entities[name.toLowerCase()] ?? entity);
}

function visibleHtmlText(value) {
  const html = String(value || '');
  let result = '';
  let cursor = 0;
  let hiddenElement = '';
  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart < 0) {
      if (!hiddenElement) result += html.slice(cursor);
      break;
    }
    if (!hiddenElement) result += html.slice(cursor, tagStart);
    const tagEnd = html.indexOf('>', tagStart + 1);
    if (tagEnd < 0) {
      if (!hiddenElement) result += html.slice(tagStart);
      break;
    }
    const tag = html.slice(tagStart + 1, tagEnd);
    const parsed = tag.match(/^\s*(\/?)\s*([\w:-]+)/);
    if (!parsed) {
      if (!hiddenElement) result += '<';
      cursor = tagStart + 1;
      continue;
    }
    const closing = Boolean(parsed[1]);
    const name = parsed[2].toLowerCase();
    if (!closing && !hiddenElement && (name === 'script' || name === 'style')) hiddenElement = name;
    else if (closing && hiddenElement === name) hiddenElement = '';
    cursor = tagEnd + 1;
  }
  return result;
}

function stripHtml(value) {
  return normalizedText(decodeMarkupEntities(visibleHtmlText(value)).replace(/\s+/g, ' '));
}

function xmlText(value) {
  return stripHtml(String(value || '')
    .replace(/<w:tab\s*\/>/gi, ' ')
    .replace(/<w:br\s*\/>/gi, '\n'));
}

function xmlElement(value, localName) {
  return decodeMarkupEntities(normalizedText(String(value || '')
    .match(new RegExp(`<(?:[\\w-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}>`, 'i'))?.[1] || ''));
}

function sourceAnchors(markdown) {
  const source = stripApplyCueCvFrontmatter(markdown);
  const candidateName = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
  const summarySection = source.match(/^##\s+Professional Summary\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im)?.[1] || '';
  const summary = normalizedText(summarySection.replace(/^[-*]\s+/gm, '')).replace(/\s+/g, ' ');
  const summaryAnchor = summary.slice(0, 90).trim();
  if (!candidateName || summaryAnchor.length < 30) throw new Error('Tailored CV Markdown needs a candidate heading and substantive Professional Summary');
  return { candidateName, summaryAnchor };
}

function expectedCvMetadata(review) {
  const url = reportUrl(review.root, review.receipt.reportPath);
  return {
    jobId: String(review.row.num),
    company: review.row.company,
    role: review.row.role,
    jobUrl: url,
    decision: 'apply',
    reviewReceiptId: review.receipt.id,
    decisionContextFingerprint: review.receipt.decisionContextFingerprint,
    jdContentFingerprint: review.receipt.jobContentFingerprint,
  };
}

function validateMetadata(actual, expected, label) {
  const issues = [];
  if (String(actual.jobId) !== String(expected.jobId)) issues.push('jobId');
  if (!sameIdentity(actual.company, expected.company)) issues.push('company');
  if (!sameIdentity(actual.role, expected.role)) issues.push('role');
  try { if (canonicalUrl(actual.jobUrl) !== canonicalUrl(expected.jobUrl)) issues.push('jobUrl'); }
  catch { issues.push('jobUrl'); }
  for (const field of ['decision', 'reviewReceiptId', 'decisionContextFingerprint', 'jdContentFingerprint']) {
    if (String(actual[field]) !== String(expected[field])) issues.push(field);
  }
  if (issues.length) throw new Error(`${label} metadata does not match the current job/review: ${issues.join(', ')}`);
}

function validateHtml(html, expected, anchors) {
  const title = normalizedText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  if (!title || !identityContains(title, expected.company) || !identityContains(title, expected.role)) {
    throw new Error('HTML title does not name the current company and role');
  }
  const meta = htmlMeta(html);
  const actual = {
    jobId: meta.get('applycue-job-id'),
    company: meta.get('applycue-company'),
    role: meta.get('applycue-role'),
    jobUrl: meta.get('applycue-job-url'),
    decision: meta.get('applycue-decision'),
    reviewReceiptId: meta.get('applycue-review-receipt'),
    decisionContextFingerprint: meta.get('applycue-decision-context'),
    jdContentFingerprint: meta.get('applycue-jd-content'),
  };
  validateMetadata(actual, expected, 'HTML');
  const text = stripHtml(html);
  if (!identityContains(text, anchors.candidateName) || !identityContains(text, anchors.summaryAnchor.slice(0, 55))) {
    throw new Error('HTML content does not match the tailored Markdown candidate/summary');
  }
  return { title };
}

function decodePdfHex(value) {
  const buffer = Buffer.from(value, 'hex');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(Math.max(0, buffer.length - 2));
    for (let i = 2; i + 1 < buffer.length; i += 2) { swapped[i - 2] = buffer[i + 1]; swapped[i - 1] = buffer[i]; }
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8');
}

function validatePdf(buffer, expected) {
  if (buffer.length < 1_000 || buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF is missing, empty, or has an invalid header');
  const raw = buffer.toString('latin1');
  if (!raw.includes('%%EOF') || !/\/Type\s*\/Page\b/.test(raw)) throw new Error('PDF does not contain a complete page structure');
  const match = raw.match(/\/Title\s*(?:\(([^)]*)\)|<([a-f0-9]+)>)/i);
  const title = normalizedText(match?.[1] || (match?.[2] ? decodePdfHex(match[2]) : ''));
  if (!title || !identityContains(title, expected.company) || !identityContains(title, expected.role)) {
    throw new Error('PDF metadata title does not name the current company and role');
  }
  return { title };
}

async function validateDocx(buffer, expected, anchors) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer, { checkCRC32: true }); }
  catch (error) { throw new Error(`DOCX is not a valid ZIP package: ${error.message}`); }
  const coreFile = zip.file('docProps/core.xml');
  const documentFile = zip.file('word/document.xml');
  if (!coreFile || !documentFile || !zip.file('[Content_Types].xml')) throw new Error('DOCX is missing required Office document parts');
  const [core, documentXml] = await Promise.all([coreFile.async('string'), documentFile.async('string')]);
  const title = xmlElement(core, 'title');
  const subject = xmlElement(core, 'subject');
  const description = xmlElement(core, 'description');
  if ((!identityContains(title, expected.company) || !identityContains(title, expected.role)) &&
      (!identityContains(subject, expected.company) || !identityContains(subject, expected.role))) {
    throw new Error('DOCX metadata does not name the current company and role');
  }
  for (const token of [expected.jobId, expected.reviewReceiptId, expected.decisionContextFingerprint, expected.jdContentFingerprint]) {
    if (!description.includes(String(token))) throw new Error('DOCX metadata is not bound to the current job/review/JD');
  }
  const text = xmlText(documentXml);
  if (!identityContains(text, anchors.candidateName) || !identityContains(text, anchors.summaryAnchor.slice(0, 55))) {
    throw new Error('DOCX content does not match the tailored Markdown candidate/summary');
  }
  return { title: title || subject, entries: Object.keys(zip.files).length };
}

function artifactRecord(path, buffer, details = {}) {
  return { path: path.path, sha256: sha256(buffer), size: buffer.length, ...details };
}

function fingerprintPayload(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    jobId: manifest.jobId,
    reportNumber: manifest.reportNumber,
    company: manifest.company,
    role: manifest.role,
    jobUrl: manifest.jobUrl,
    decision: manifest.decision,
    rank: manifest.rank,
    confidence: manifest.confidence,
    reviewReceiptId: manifest.reviewReceiptId,
    decisionContextFingerprint: manifest.decisionContextFingerprint,
    jdPath: manifest.jdPath,
    jdContentFingerprint: manifest.jdContentFingerprint,
    reportPath: manifest.reportPath,
    artifacts: manifest.artifacts,
  };
}

async function inspectArtifacts(root, paths, expected) {
  const md = resolveOutputArtifact(root, paths.md, '.md');
  const html = resolveOutputArtifact(root, paths.html, '.html');
  const pdf = resolveOutputArtifact(root, paths.pdf, '.pdf');
  const docx = resolveOutputArtifact(root, paths.docx, '.docx');
  const mdBuffer = readFileSync(md.full);
  const htmlBuffer = readFileSync(html.full);
  const pdfBuffer = readFileSync(pdf.full);
  const docxBuffer = readFileSync(docx.full);
  const mdText = mdBuffer.toString('utf8');
  const metadata = parseApplyCueCvMetadata(mdText, { required: true });
  validateMetadata(metadata, expected, 'Markdown');
  const anchors = sourceAnchors(mdText);
  const htmlDetails = validateHtml(htmlBuffer.toString('utf8'), expected, anchors);
  const pdfDetails = validatePdf(pdfBuffer, expected);
  const docxDetails = await validateDocx(docxBuffer, expected, anchors);
  return {
    md: artifactRecord(md, mdBuffer, { candidateName: anchors.candidateName }),
    html: artifactRecord(html, htmlBuffer, htmlDetails),
    pdf: artifactRecord(pdf, pdfBuffer, pdfDetails),
    docx: artifactRecord(docx, docxBuffer, docxDetails),
  };
}

function currentApplyReview(root, jobId, options = {}) {
  const review = reviewFreshnessForJob(root, jobId, options);
  if (review.state !== 'current' || review.effectiveDecision !== 'apply' || !review.receipt) {
    const detail = review.issues?.join('; ') || `effective decision is ${review.effectiveDecision}`;
    throw new Error(`Job #${jobId} needs a current apply review before recording a CV bundle: ${detail}`);
  }
  return { ...review, root };
}

export async function recordCvBundle(root = ROOT, options = {}) {
  const jobId = String(options.jobId || '').trim();
  if (!/^\d+$/.test(jobId)) throw new Error('record needs a numeric tracker job id');
  const actorName = normalizedText(options.actorName);
  if (!actorName) throw new Error('record needs an actor name such as codex or claude');
  const review = currentApplyReview(root, jobId, options);
  const expected = expectedCvMetadata(review);
  const artifacts = await inspectArtifacts(root, options, expected);
  const reportNumber = basename(review.receipt.reportPath).match(/^(\d+)-/)?.[1] || '';
  if (!reportNumber) throw new Error(`Review report filename needs a numeric prefix: ${review.receipt.reportPath}`);
  const jdFull = resolve(root, review.receipt.jdPath);
  const jd = parseJdCaptureFile(jdFull);
  if (jd.metadata.jobContentFingerprint !== review.receipt.jobContentFingerprint) throw new Error('Current JD capture does not match the review receipt');
  const rows = readIndexRows(root, options.indexPath);
  const base = [...rows].reverse().find((row) =>
    normalizeReportNumber(row.report) === normalizeReportNumber(reportNumber) || row.pdf === artifacts.pdf.path);
  const format = String(options.format || base?.format || '').toLowerCase();
  if (!['a4', 'letter'].includes(format)) throw new Error('CV bundle needs format a4 or letter (generate the PDF with --report first, or pass --format)');
  const manifest = {
    schemaVersion: CV_BUNDLE_SCHEMA,
    id: randomUUID(),
    jobId,
    reportNumber,
    company: review.row.company,
    role: review.row.role,
    jobUrl: expected.jobUrl,
    decision: review.row.decision,
    rank: review.row.rank,
    confidence: review.row.confidence,
    reviewReceiptId: review.receipt.id,
    decisionContextFingerprint: review.receipt.decisionContextFingerprint,
    jdPath: review.receipt.jdPath,
    jdContentFingerprint: review.receipt.jobContentFingerprint,
    reportPath: review.receipt.reportPath,
    artifacts,
    format,
    actorName,
    createdAt: options.createdAt || new Date().toISOString(),
  };
  manifest.bundleFingerprint = stableHash(fingerprintPayload(manifest));
  const prior = latestCvBundleManifest(root, jobId, options.indexPath);
  if (prior?.bundleFingerprint === manifest.bundleFingerprint) return { ...prior, unchanged: true };
  const kept = rows.filter((row) =>
    normalizeReportNumber(row.report) !== normalizeReportNumber(reportNumber) &&
    String(row.manifest?.jobId || '') !== jobId && row.pdf !== artifacts.pdf.path);
  kept.push({
    raw: [reportNumber, artifacts.pdf.path, artifacts.html.path, format, manifest.createdAt.slice(0, 10), JSON.stringify(manifest)].join('\t'),
  });
  writeIndexRows(root, kept, options.indexPath);
  return { ...manifest, unchanged: false };
}

export async function cvBundleFreshnessForJob(root = ROOT, jobId, options = {}) {
  let review;
  try { review = currentApplyReview(root, String(jobId), options); }
  catch (error) { return { state: 'stale', issues: [error.message], manifest: latestCvBundleManifest(root, jobId, options.indexPath) }; }
  const manifest = latestCvBundleManifest(root, jobId, options.indexPath);
  if (!manifest) return { state: 'missing', issues: ['No fingerprint-bound CV bundle'], manifest: null };
  const issues = [];
  if (manifest.schemaVersion !== CV_BUNDLE_SCHEMA) issues.push('Unsupported CV bundle schema');
  if (manifest.reviewReceiptId !== review.receipt.id) issues.push('Review receipt changed after CV preparation');
  if (manifest.decisionContextFingerprint !== review.receipt.decisionContextFingerprint) issues.push('Review decision context changed after CV preparation');
  if (manifest.jdContentFingerprint !== review.receipt.jobContentFingerprint || manifest.jdPath !== review.receipt.jdPath) issues.push('Full JD changed after CV preparation');
  if (!sameIdentity(manifest.company, review.row.company) || !sameIdentity(manifest.role, review.row.role)) issues.push('Tracker company/role changed after CV preparation');
  if (manifest.decision !== review.row.decision || manifest.rank !== review.row.rank || manifest.confidence !== review.row.confidence) issues.push('Tracker decision/rank/confidence changed after CV preparation');
  try {
    if (canonicalUrl(manifest.jobUrl) !== reportUrl(root, review.receipt.reportPath)) issues.push('Job URL changed after CV preparation');
  } catch (error) { issues.push(error.message); }
  let currentArtifacts;
  try {
    currentArtifacts = await inspectArtifacts(root, {
      md: manifest.artifacts?.md?.path,
      html: manifest.artifacts?.html?.path,
      pdf: manifest.artifacts?.pdf?.path,
      docx: manifest.artifacts?.docx?.path,
    }, expectedCvMetadata(review));
    for (const kind of ['md', 'html', 'pdf', 'docx']) {
      if (currentArtifacts[kind].sha256 !== manifest.artifacts?.[kind]?.sha256) issues.push(`${kind.toUpperCase()} artifact changed`);
    }
  } catch (error) { issues.push(error.message); }
  if (stableHash(fingerprintPayload(manifest)) !== manifest.bundleFingerprint) issues.push('CV bundle record contents changed');
  let selectedArtifact = null;
  if (options.selectedPath) {
    try {
      const selected = repoRelative(root, resolve(root, options.selectedPath));
      selectedArtifact = ['pdf', 'docx'].map((kind) => ({ kind, ...manifest.artifacts?.[kind] }))
        .find((artifact) => artifact.path === selected) || null;
      if (!selectedArtifact) issues.push('Selected upload is not the verified PDF or DOCX in this bundle');
      else if (currentArtifacts?.[selectedArtifact.kind]?.sha256 !== selectedArtifact.sha256) issues.push('Selected upload changed after bundle verification');
    } catch { issues.push('Selected upload path is invalid'); }
  }
  return { state: issues.length ? 'stale' : 'current', issues: [...new Set(issues)], manifest, selectedArtifact };
}

export async function assertCurrentCvBundle(root = ROOT, jobId, options = {}) {
  const result = await cvBundleFreshnessForJob(root, jobId, options);
  if (result.state !== 'current') throw new Error(`Job #${jobId} needs a current verified CV bundle before application: ${result.issues.join('; ')}`);
  if (options.selectedPath && !result.selectedArtifact) throw new Error(`Job #${jobId} selected upload is not in its verified CV bundle`);
  return result;
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function usage() {
  console.error('Usage:\n  node cv-bundle.mjs record --job=N --md=output/cv.md --html=output/cv.html --pdf=output/cv.pdf --docx=output/cv.docx --actor=codex [--format=a4|letter]\n  node cv-bundle.mjs check --job=N [--cv=output/cv.pdf]');
}

async function main() {
  const command = process.argv[2];
  if (command === 'record') {
    console.log(JSON.stringify(await recordCvBundle(ROOT, {
      jobId: option('job'), md: option('md'), html: option('html'), pdf: option('pdf'), docx: option('docx'),
      actorName: option('actor'), format: option('format'),
    }), null, 2));
    return;
  }
  if (command === 'check') {
    const result = await cvBundleFreshnessForJob(ROOT, option('job'), { selectedPath: option('cv') });
    console.log(JSON.stringify(result, null, 2));
    if (result.state !== 'current') process.exitCode = 1;
    return;
  }
  usage();
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
