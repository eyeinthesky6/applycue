import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  formatApplyCueCvFrontmatter, markdownToDocxParagraphs, normalizeCvTextForAts,
  parseApplyCueCvMetadata, renderAtsDocx,
} from './generate-docx.mjs';

assert.equal(normalizeCvTextForAts('Built “AI” → ₹1 cr'), 'Built "AI" to Rs 1 cr');
assert.equal(markdownToDocxParagraphs('# Name\n\n## Experience\n- Built a product').length, 3);
const buffer = await renderAtsDocx('# Jane Doe\n\n## Experience\n- Built a product');
assert.equal(buffer.subarray(0, 2).toString(), 'PK');
assert.ok(buffer.length > 1000);
const metadata = {
  schemaVersion: 'applycue-cv-source-v1', jobId: '7', company: 'Acme', role: 'Product Director',
  jobUrl: 'https://jobs.example.com/acme/7', decision: 'apply', reviewReceiptId: 'receipt-7',
  decisionContextFingerprint: 'a'.repeat(64), jdContentFingerprint: 'b'.repeat(64),
};
const tailored = `${formatApplyCueCvFrontmatter(metadata)}# Jane Doe\n\n## Professional Summary\n\nProduct leader with measurable outcomes.`;
assert.deepEqual(parseApplyCueCvMetadata(tailored), metadata);
assert.equal(markdownToDocxParagraphs(tailored).length, 3);
const tailoredZip = await JSZip.loadAsync(await renderAtsDocx(tailored), { checkCRC32: true });
const core = await tailoredZip.file('docProps/core.xml').async('string');
assert.match(core, /Jane Doe - Acme Product Director CV/);
assert.match(core, /receipt-7/);
assert.match(core, new RegExp('a{64}'));
console.log('generate-docx tests passed');
