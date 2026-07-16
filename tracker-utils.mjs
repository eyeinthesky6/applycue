/**
 * tracker-utils.mjs — side-effect-free shared tracker helpers.
 *
 * The tracker is a markdown table that several scripts mutate in place
 * (`dedup-tracker.mjs`, `normalize-statuses.mjs`, `merge-tracker.mjs`). Keeping
 * path selection, first-use creation, and row rewriting here prevents those
 * owners from selecting different sources or duplicating the canonical schema.
 */

import { existsSync, linkSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { basename, dirname, join, resolve } from 'path';

export const CANONICAL_TRACKER_HEADER = '| # | Date | Company | Role | Score | Status | Decision | Rank | Confidence | Origin | PDF | Report | Notes |';
export const CANONICAL_TRACKER_SEPARATOR = '|---|------|---------|------|-------|--------|----------|------|------------|--------|-----|--------|-------|';
export const CANONICAL_TRACKER_SKELETON = `# Applications Tracker\n\n${CANONICAL_TRACKER_HEADER}\n${CANONICAL_TRACKER_SEPARATOR}\n`;

function canonicalPath(path) {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/**
 * Resolve the single tracker source used by every owner.
 *
 * Precedence is explicit override, existing data tracker, existing legacy root
 * tracker, then the canonical data path for a virgin setup. Existing trackers
 * are realpath-normalized so lock and index owners use the same spelling.
 *
 * @param {{root?:string, override?:string}} [options] Resolution inputs.
 * @returns {string} Absolute canonical tracker path.
 */
export function resolveTrackerPath({ root = process.cwd(), override = '' } = {}) {
  if (override) return canonicalPath(override);
  const base = resolve(root);
  const dataTracker = join(base, 'data', 'applications.md');
  const rootTracker = join(base, 'applications.md');
  if (existsSync(dataTracker)) return canonicalPath(dataTracker);
  if (existsSync(rootTracker)) return canonicalPath(rootTracker);
  return dataTracker;
}

/**
 * Create the canonical Markdown source of truth only when it is absent.
 *
 * The complete skeleton is written to a same-directory temporary file first,
 * then linked into place with create-if-absent semantics. Concurrent first
 * writers cannot replace one another, and readers never observe a partial
 * initial table. Importing this module performs no filesystem mutation.
 *
 * @param {string} path Tracker path selected by resolveTrackerPath.
 * @returns {boolean} True when this call created the tracker.
 */
export function initializeTrackerFile(path) {
  if (!path) throw new Error('Tracker path is required');
  if (existsSync(path)) return false;
  mkdirSync(dirname(path) || '.', { recursive: true });
  const tmpPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.init.tmp`);
  try {
    writeFileSync(tmpPath, CANONICAL_TRACKER_SKELETON, { encoding: 'utf-8', flag: 'wx' });
    try {
      linkSync(tmpPath, path);
      return true;
    } catch (err) {
      if (err?.code === 'EEXIST') return false;
      throw err;
    }
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

/**
 * Rebuild a markdown table row from the cells produced by `line.split('|')`.
 *
 * `split('|')` yields a leading empty element (before the opening `|`) and,
 * when the row ends with a trailing `|`, a trailing empty element too. A naive
 * `slice(1, -1)` assumes that trailing empty always exists — but a row written
 * without a trailing pipe (`| 5 | … | note`, still a valid row) keeps its real
 * last cell (the notes) at the end, so `slice(1, -1)` silently drops it. Here we
 * drop the leading empty and only drop a trailing element when it is genuinely
 * empty, preserving every real cell regardless of trailing-pipe style (and
 * tolerating extra columns like a custom Location).
 *
 * @param {string[]} parts - Trimmed cells from `line.split('|').map(s => s.trim())`.
 * @returns {string} The rebuilt `| a | b | … |` row.
 */
export function rebuildRow(parts) {
  const cells = parts.slice(1);
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return '| ' + cells.join(' | ') + ' |';
}
