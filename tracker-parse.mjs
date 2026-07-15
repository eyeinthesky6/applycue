/**
 * tracker-parse.mjs — shared header-aware column mapping for `data/applications.md`.
 *
 * The tracker is a markdown table that several scripts read. #946/#954 made the
 * column layout customizable (e.g. an inserted Location column) by mapping
 * columns *by header name* instead of fixed position — but that logic only
 * lived in `merge-tracker.mjs`. This module is the single home for it, so every
 * reader (merge-tracker, dedup-tracker, followup-cadence, analyze-patterns)
 * tolerates the same layouts and can't drift apart.
 *
 * Indexing matches `line.split('|')`: index 0 is the empty cell before the
 * leading pipe, so the first real column ("#"/num) is index 1.
 */

/** The original fixed 9-column layout (num … notes at indices 1 … 9). */
export const LEGACY_COLMAP = {
  num: 1, date: 2, company: 3, role: 4, score: 5, status: 6, pdf: 7, report: 8, notes: 9,
};

/** Header text (lowercased) → canonical field name. Includes ES aliases. */
export const HEADER_ALIASES = {
  '#': 'num', 'num': 'num', 'date': 'date', 'company': 'company', 'empresa': 'company',
  'role': 'role', 'puesto': 'role', 'location': 'location', 'score': 'score',
  'status': 'status', 'decision': 'decision', 'rank': 'rank',
  'confidence': 'confidence', 'origin': 'origin',
  'pdf': 'pdf', 'report': 'report', 'notes': 'notes',
};

export const DECISIONS = Object.freeze(['pending', 'apply', 'watch', 'skip']);
export const CONFIDENCES = Object.freeze(['high', 'medium', 'low', 'unknown']);
export const ORIGINS = Object.freeze(['current', 'legacy_import', 'mail_import', 'legacy_unknown']);

/**
 * Normalize the agent's semantic decision without treating a lifecycle status
 * such as `Evaluated` as a shortlist decision. Old rows may carry an explicit
 * `[AGENT: APPLY|WATCH|SKIP]` marker in Notes; submitted/replied rows also prove
 * that an apply decision happened. Everything else remains pending.
 */
export function normalizeDecision(raw, { status = '', notes = '' } = {}) {
  const value = String(raw || '').trim().toLowerCase();
  const aliases = { pending: 'pending', review: 'pending', apply: 'apply', shortlist: 'apply', watch: 'watch', hold: 'watch', skip: 'skip' };
  if (aliases[value]) return aliases[value];

  const marker = String(notes || '').match(/\[AGENT:\s*(APPLY|WATCH|SKIP)\]/i)?.[1]?.toLowerCase();
  if (marker) return marker;

  const lifecycle = String(status || '').trim().toLowerCase();
  if (['applied', 'responded', 'interview', 'offer', 'rejected'].includes(lifecycle)) return 'apply';
  if (lifecycle === 'skip') return 'skip';
  return 'pending';
}

/**
 * Rank is the external agent's explicit ordering of the current apply queue.
 * It is deliberately not inferred from a score. Non-ranked rows use an em dash.
 */
export function normalizeRank(raw) {
  const value = String(raw ?? '').trim();
  if (!/^\d+$/.test(value)) return '—';
  const rank = Number(value);
  return Number.isSafeInteger(rank) && rank > 0 ? String(rank) : '—';
}

/** Normalize review confidence without inventing certainty for old rows. */
export function normalizeConfidence(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return CONFIDENCES.includes(value) ? value : 'unknown';
}

/**
 * Origin is internal provenance. A missing Origin column means the row predates
 * this contract, so it must not silently enter current-run dashboard counts.
 */
export function normalizeOrigin(raw, { hasOriginColumn = true } = {}) {
  if (!hasOriginColumn) return 'legacy_unknown';
  const value = String(raw || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  const aliases = {
    current: 'current', new: 'current',
    imported: 'legacy_import', history: 'legacy_import', historical: 'legacy_import', legacy: 'legacy_import', legacy_import: 'legacy_import', career_ops: 'legacy_import',
    mail: 'mail_import', email: 'mail_import', mail_import: 'mail_import',
    legacy_unknown: 'legacy_unknown', unknown: 'legacy_unknown',
  };
  return aliases[value] || 'legacy_unknown';
}

/**
 * Scan the table for a header row and build a field-name → column-index map.
 * Indexing matches `line.split('|')`. Returns null — caller should fall back to
 * LEGACY_COLMAP — unless the essential columns are all present, so a stray pipe
 * line can't yield a bogus mapping.
 *
 * @param {string[]} lines - All lines of applications.md.
 * @returns {Object<string,number>|null}
 */
export function detectColumns(lines) {
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(s => s.trim().toLowerCase());
    if (!cells.includes('company') || !cells.includes('role')) continue;
    const map = {};
    cells.forEach((c, i) => { if (HEADER_ALIASES[c] != null) map[HEADER_ALIASES[c]] = i; });
    if (['num', 'company', 'role', 'score', 'status'].every(k => map[k] != null)) return map;
  }
  return null;
}

/**
 * Convenience: detect the header layout, falling back to the legacy fixed one.
 * @param {string[]} lines
 * @returns {Object<string,number>}
 */
export function resolveColumns(lines) {
  return detectColumns(lines) || LEGACY_COLMAP;
}

/**
 * Parse one markdown table row into a tracker object using a column map.
 *
 * Header and separator rows (non-numeric `num` cell) and malformed rows return
 * null. The raw line is preserved so callers can locate/replace the exact line.
 *
 * @param {string} line - One line from applications.md.
 * @param {Object<string,number>} [colmap] - From resolveColumns(); defaults to legacy.
 * @returns {object|null} Parsed row including normalized review metadata.
 */
export function parseTrackerRow(line, colmap = LEGACY_COLMAP) {
  if (typeof line !== 'string' || !line.startsWith('|')) return null;
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[colmap.num], 10);
  if (isNaN(num)) return null;
  const at = (k) => (colmap[k] != null ? (parts[colmap[k]] ?? '') : '');
  const row = {
    num,
    date: at('date'),
    company: at('company'),
    role: at('role'),
    score: at('score'),
    status: at('status'),
    pdf: at('pdf'),
    report: at('report'),
    notes: at('notes'),
    raw: line,
  };
  row.decision = normalizeDecision(at('decision'), row);
  row.rank = normalizeRank(at('rank'));
  row.confidence = normalizeConfidence(at('confidence'));
  row.origin = normalizeOrigin(at('origin'), { hasOriginColumn: colmap.origin != null });
  if (colmap.location != null) row.location = at('location');
  return row;
}
