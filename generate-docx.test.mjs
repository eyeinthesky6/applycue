import assert from 'node:assert/strict';
import { markdownToDocxParagraphs, normalizeCvTextForAts, renderAtsDocx } from './generate-docx.mjs';

assert.equal(normalizeCvTextForAts('Built “AI” → ₹1 cr'), 'Built "AI" to Rs 1 cr');
assert.equal(markdownToDocxParagraphs('# Name\n\n## Experience\n- Built a product').length, 3);
const buffer = await renderAtsDocx('# Jane Doe\n\n## Experience\n- Built a product');
assert.equal(buffer.subarray(0, 2).toString(), 'PK');
assert.ok(buffer.length > 1000);
console.log('generate-docx tests passed');
