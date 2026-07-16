#!/usr/bin/env node

/**
 * tracker.mjs — SQLite derived index for the applications tracker (RFC #918, phase 1).
 *
 * data/applications.md stays the source of truth. The SQLite DB is a derived
 * index, built and rebuilt from the markdown — safe to delete at any time, it
 * regenerates on the next sync. Tools and agents READ through the index for
 * schema-validated, model-independent results; all writes keep going to the
 * markdown exactly as today (merge-tracker.mjs, hand edits).
 *
 * Why: at hundreds of rows, a markdown table degrades structurally — encoding
 * corruption propagates, columns drift, a `|` inside a cell shifts every
 * column after it, and agents grepping the table get model-dependent results.
 * The index normalizes on sync (canonical statuses, repaired columns) so every
 * query returns the same rows for every model on every CLI, and corruption is
 * DETECTED at sync time instead of propagating silently.
 *
 * Phase 2 of #918 (DB becomes source of truth, markdown becomes a rendered
 * view) is a separate, explicit per-user opt-in — not implemented here.
 *
 * Zero new dependencies — uses node:sqlite (built into Node >= 22.5).
 *
 * Usage:
 *   node tracker.mjs sync [--check]             # (re)build applications.db from applications.md
 *                                               # --check: diagnose only, no write; exit 1 if issues found
 *   node tracker.mjs query [--status Applied] [--company acme] [--role designer]
 *                          [--decision apply] [--origin current]
 *                          [--since 2026-01-01] [--id N] [--limit 20] [--json]
 *   node tracker.mjs history --id N             # status transition log observed across syncs
 *   node tracker.mjs export [--out FILE]        # inverse: applications.db → canonical markdown (stdout by default)
 *   node tracker.mjs delete --num N [--dry-run] # remove one application row from applications.md + reindex
 *   node tracker.mjs status --num N --status Applied [--company Acme --title "Product Lead"]
 *   node tracker.mjs migrate-metadata [--current-ids 6] [--legacy-ids 1-5] [--write]
 *
 * query/history auto-resync when applications.md changed since the last sync,
 * so the index can never serve stale reads.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, statSync, renameSync, rmSync, linkSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { dirname, resolve, join, basename } from 'path';
import { pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { detectColumns, normalizeConfidence, normalizeDecision, normalizeOrigin, normalizeRank, parseTrackerRow, resolveColumns } from './tracker-parse.mjs';

const MD_PATH = process.env.APPLYCUE_TRACKER || 'data/applications.md';
const DB_PATH = process.env.APPLYCUE_TRACKER_DB
  || (MD_PATH.endsWith('.md') ? MD_PATH.slice(0, -3) + '.db' : MD_PATH + '.db');

// SQLite must never open the source of truth itself (an explicit
// APPLYCUE_TRACKER_DB could point both names at the same file).
if (resolve(MD_PATH) === resolve(DB_PATH)) {
  console.error(`Error: DB path must differ from the markdown path (${MD_PATH}).`);
  process.exit(1);
}
const STATES_PATH = 'templates/states.yml';
const HEADER = '| # | Date | Company | Role | Score | Status | Decision | Rank | Confidence | Origin | PDF | Report | Notes |';
const SEPARATOR = '|---|------|---------|------|-------|--------|----------|------|------------|--------|-----|--------|-------|';
export const CANONICAL_TRACKER_SKELETON = `# Applications Tracker\n\n${HEADER}\n${SEPARATOR}\n`;
const CANONICAL_COLMAP = { num: 1, date: 2, company: 3, role: 4, score: 5, status: 6, decision: 7, rank: 8, confidence: 9, origin: 10, pdf: 11, report: 12, notes: 13 };

/**
 * Create the canonical Markdown source of truth only when it is absent.
 *
 * The complete skeleton is written to a same-directory temporary file first,
 * then linked into place with create-if-absent semantics. Concurrent first
 * syncs therefore cannot replace a tracker another process has just created,
 * and readers never observe a partially written initial table.
 *
 * @param {string} [path=MD_PATH] Tracker path to initialize.
 * @returns {boolean} True when this call created the tracker.
 */
export function initializeTrackerFile(path = MD_PATH) {
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

// ── node:sqlite loading ─────────────────────────────────────────────

async function loadSqlite() {
  // node:sqlite is stable in behavior but still flagged experimental in some
  // Node lines — silence only that one warning, leave everything else alone.
  const origEmit = process.emitWarning;
  process.emitWarning = (warning, ...args) => {
    const text = typeof warning === 'string' ? warning : warning?.message || '';
    if (text.includes('SQLite is an experimental feature')) return;
    return origEmit.call(process, warning, ...args);
  };
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return DatabaseSync;
  } catch {
    console.error('Error: node:sqlite is not available. tracker.mjs needs Node >= 22.5 (you are on ' + process.version + ').');
    console.error('The markdown tracker keeps working without it — the index is optional.');
    process.exit(1);
  } finally {
    process.emitWarning = origEmit; // the warning fires at import time — safe to restore here
  }
}

function openDb(DatabaseSync) {
  mkdirSync(dirname(DB_PATH) || '.', { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON'); // SQLite ignores REFERENCES without this
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id      INTEGER PRIMARY KEY,
      pos     INTEGER NOT NULL,
      date    TEXT NOT NULL,
      company TEXT NOT NULL,
      role    TEXT NOT NULL,
      score   TEXT NOT NULL DEFAULT '—',
      status  TEXT NOT NULL,
      decision TEXT NOT NULL DEFAULT 'pending',
      rank     TEXT NOT NULL DEFAULT '—',
      confidence TEXT NOT NULL DEFAULT 'unknown',
      origin   TEXT NOT NULL DEFAULT 'legacy_unknown',
      pdf     TEXT NOT NULL DEFAULT '❌',
      report  TEXT NOT NULL DEFAULT '—',
      notes   TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS status_events (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES applications(id),
      status TEXT NOT NULL,
      date   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_apps_company ON applications(company);
    CREATE INDEX IF NOT EXISTS idx_events_app ON status_events(app_id);
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(applications)').all().map((column) => column.name));
  if (!columns.has('decision')) db.exec("ALTER TABLE applications ADD COLUMN decision TEXT NOT NULL DEFAULT 'pending'");
  if (!columns.has('rank')) db.exec("ALTER TABLE applications ADD COLUMN rank TEXT NOT NULL DEFAULT '—'");
  if (!columns.has('confidence')) db.exec("ALTER TABLE applications ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown'");
  if (!columns.has('origin')) db.exec("ALTER TABLE applications ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy_unknown'");
  return db;
}

// ── Canonical states (templates/states.yml is the source of truth) ──

function loadStates() {
  if (!existsSync(STATES_PATH)) {
    console.error(`Error: ${STATES_PATH} not found — cannot validate statuses. Run from the ApplyCue root.`);
    process.exit(1);
  }
  const doc = yaml.load(readFileSync(STATES_PATH, 'utf-8'));
  const byKey = new Map(); // lowercased label/alias → canonical label
  const labels = [];
  for (const s of doc?.states || []) {
    if (!s?.label) continue;
    labels.push(s.label);
    byKey.set(s.label.toLowerCase(), s.label);
    if (s.id) byKey.set(String(s.id).toLowerCase(), s.label);
    for (const alias of s.aliases || []) byKey.set(String(alias).toLowerCase(), s.label);
  }
  return { byKey, labels };
}

// Strip markdown bold, trailing dates, and surrounding noise, then resolve
// against canonical labels/aliases. Returns the canonical label or null.
function normalizeStatus(raw, states) {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/\*\*/g, '')
    .replace(/\(?\d{4}-\d{2}-\d{2}\)?/g, '')
    .trim()
    .toLowerCase();
  return states.byKey.get(cleaned) || null;
}

const SCORE_RE = /^\*{0,2}(\d(?:\.\d)?\/5)\*{0,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mojibake left by a UTF-8 → GBK → UTF-8 round trip: an em-dash cell becomes
// "鈥?" / "鈥�" variants. Only short placeholder cells are repaired — free-text
// notes are preserved as-is rather than risk corrupting real content.
function repairPlaceholder(cell) {
  if (/^鈥.{0,2}$/.test(cell) || cell === '�') return '—';
  return cell;
}

// ── Markdown parsing ────────────────────────────────────────────────

function parseMarkdownRows(text, diag) {
  const lines = text.split('\n');
  const colmap = resolveColumns(lines);
  const maxIdx = Math.max(...Object.values(colmap));
  const rows = [];
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    let parts = line.trim().split('|').map(c => c.trim());
    if (parts.length > maxIdx + 2 && colmap.notes === maxIdx) {
      parts[colmap.notes] = parts.slice(colmap.notes, -1).join(' | ');
      parts = [...parts.slice(0, colmap.notes + 1), ''];
      if (diag) diag.strayPipes++;
    }
    const row = parseTrackerRow(parts.join('|'), colmap);
    if (row) rows.push(row);
  }
  return rows;
}

// Remove every table row whose first cell (the application number) equals `num`,
// preserving the rest of the file (header, separators, spacing, other rows)
// byte-for-byte. Pure: returns { removed, removedCount, report, newContent }.
// `report` is the report-column value of the first removed row, so callers can
// surface the now-orphaned report file. Numbers are unique in practice, but any
// duplicates are all removed.
export function removeRowByNum(content, num) {
  const target = String(num).trim();
  let removedCount = 0;
  let report = null;
  const lines = content.split('\n');
  const colmap = resolveColumns(lines);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t.startsWith('|')) return true; // non-table line — keep verbatim
    const row = parseTrackerRow(t, colmap);
    if (row && String(row.num) === target) {
      removedCount++;
      if (report === null) report = row.report || null;
      return false;
    }
    return true;
  });
  return { removed: removedCount > 0, removedCount, report, newContent: kept.join('\n') };
}

function normalizedIdentity(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Update one exact tracker row's lifecycle status while preserving every other
 * row and field. Pure: the caller owns validation, persistence, and reindexing.
 */
export function updateStatusByNum(content, num, status, { company = '', title = '' } = {}) {
  const target = String(num || '').trim();
  if (!/^\d+$/.test(target)) throw new Error('Application number must be a positive integer');
  const canonicalStatus = String(status || '').trim();
  if (!canonicalStatus) throw new Error('A canonical application status is required');

  const lines = String(content).split('\n');
  const colmap = resolveColumns(lines);
  if (!colmap || colmap.status == null) throw new Error('Tracker has no recognizable Status column');
  const matches = [];
  for (let index = 0; index < lines.length; index++) {
    const row = parseTrackerRow(lines[index], colmap);
    if (row && String(row.num) === target) matches.push({ index, row });
  }
  if (matches.length === 0) throw new Error(`No application numbered ${target} in the tracker`);
  if (matches.length > 1) throw new Error(`Application number ${target} is duplicated in the tracker`);

  const { index, row } = matches[0];
  if (company && normalizedIdentity(row.company) !== normalizedIdentity(company)) {
    throw new Error(`Tracker job ${target} company does not match the application attempt`);
  }
  if (title && normalizedIdentity(row.role) !== normalizedIdentity(title)) {
    throw new Error(`Tracker job ${target} title does not match the application attempt`);
  }

  const cells = markdownCells(lines[index]);
  cells[colmap.status - 1] = canonicalStatus;
  lines[index] = markdownRow(cells);
  return {
    jobId: target,
    company: row.company,
    title: row.role,
    previousStatus: row.status,
    status: canonicalStatus,
    changed: row.status !== canonicalStatus,
    newContent: lines.join('\n'),
  };
}

// Parse + normalize the markdown into index-ready rows. The markdown itself is
// never modified — normalization lives only in the derived index, and the
// diagnostics tell the user what to fix at the source (normalize-statuses.mjs,
// dedup-tracker.mjs).
function parseTracker(states) {
  const diag = { mojibake: 0, scoreInStatus: 0, unknownStatus: 0, badId: 0, badDate: 0, strayPipes: 0 };
  const rows = parseMarkdownRows(readFileSync(MD_PATH, 'utf-8'), diag);

  const usedIds = new Set();
  let maxId = 0;
  const apps = [];

  for (const row of rows) {
    let { num: idRaw, date, company, role, score, status, decision, rank, confidence, origin, pdf, report, notes } = row;

    const before = [score, pdf, report].join('|');
    score = repairPlaceholder(score);
    pdf = repairPlaceholder(pdf);
    report = repairPlaceholder(report);
    if ([score, pdf, report].join('|') !== before) diag.mojibake++;

    // Score sitting in the status column (column drift)
    const scoreInStatus = status.match(SCORE_RE);
    if (scoreInStatus) {
      if (!SCORE_RE.test(score)) score = scoreInStatus[1];
      status = 'Evaluated';
      diag.scoreInStatus++;
    }

    const canonical = normalizeStatus(status, states);
    if (!canonical) {
      notes = notes ? `${notes} [sync: original status "${status}"]` : `[sync: original status "${status}"]`;
      status = 'Evaluated';
      diag.unknownStatus++;
    } else {
      status = canonical;
    }

    let id = parseInt(idRaw, 10);
    if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) {
      id = 0; // assign after the pass, once maxId is known
      diag.badId++;
    } else {
      usedIds.add(id);
      if (id > maxId) maxId = id;
    }

    if (!DATE_RE.test(date)) diag.badDate++; // kept as-is — flagged, not destroyed

    apps.push({ id, pos: apps.length, date, company, role, score: score || '—', status, decision, rank, confidence, origin, pdf: pdf || '❌', report: report || '—', notes });
  }
  for (const app of apps) if (app.id === 0) app.id = ++maxId;

  return { apps, diag };
}

function mdHash() {
  return createHash('sha256').update(readFileSync(MD_PATH)).digest('hex');
}

// ── Sync (markdown → derived index) ─────────────────────────────────

function reportDiagnostics(diag) {
  const total = Object.values(diag).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.error('No corruption detected — index matches the markdown cleanly.');
    return 0;
  }
  console.error(`Corruption detected in ${MD_PATH} (normalized in the index only — the markdown is untouched):`);
  if (diag.mojibake) console.error(`  ${diag.mojibake} mojibake placeholder cell(s)`);
  if (diag.scoreInStatus) console.error(`  ${diag.scoreInStatus} score(s) sitting in the status column`);
  if (diag.unknownStatus) console.error(`  ${diag.unknownStatus} non-canonical status(es), indexed as Evaluated (original kept in notes)`);
  if (diag.badId) console.error(`  ${diag.badId} missing/duplicate id(s), reassigned in the index`);
  if (diag.badDate) console.error(`  ${diag.badDate} malformed date(s), kept as-is`);
  if (diag.strayPipes) console.error(`  ${diag.strayPipes} row(s) with stray pipes, folded into notes`);
  console.error('Fix at the source with `node normalize-statuses.mjs` / `node dedup-tracker.mjs`, then re-sync.');
  return total;
}

function syncIndex(db, states) {
  const { apps, diag } = parseTracker(states);
  const today = new Date().toISOString().slice(0, 10);

  db.exec('BEGIN');
  db.exec('PRAGMA defer_foreign_keys = ON'); // full rebuild — FKs settle at commit
  try {
    db.exec('DELETE FROM applications');
    const insertApp = db.prepare('INSERT INTO applications (id, pos, date, company, role, score, status, decision, rank, confidence, origin, pdf, report, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of apps) insertApp.run(a.id, a.pos, a.date, a.company, a.role, a.score, a.status, a.decision, a.rank, a.confidence, a.origin, a.pdf, a.report, a.notes);

    // Status history: events persist across rebuilds, keyed by id. An app whose
    // status changed since the last sync gets a new event; rows that left the
    // markdown lose their events (the index never outlives its source).
    db.exec('DELETE FROM status_events WHERE app_id NOT IN (SELECT id FROM applications)');
    const latestEvent = db.prepare('SELECT status FROM status_events WHERE app_id = ? ORDER BY id DESC LIMIT 1');
    const insertEvent = db.prepare('INSERT INTO status_events (app_id, status, date) VALUES (?, ?, ?)');
    for (const a of apps) {
      const last = latestEvent.get(a.id);
      if (!last) insertEvent.run(a.id, a.status, DATE_RE.test(a.date) ? a.date : today);
      else if (last.status !== a.status) insertEvent.run(a.id, a.status, today);
    }

    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('md_sha256', mdHash());
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { apps, diag };
}

async function sync(args) {
  if (!existsSync(MD_PATH)) {
    if (args.includes('--check')) {
      console.error(`Error: ${MD_PATH} not found — sync would initialize the canonical tracker.`);
      console.error('(--check — no tracker or index written)');
      process.exit(1);
    }
    const created = initializeTrackerFile(MD_PATH);
    if (created) console.error(`Initialized canonical tracker at ${MD_PATH}`);
  }
  const states = loadStates();

  if (args.includes('--check')) {
    const { apps, diag } = parseTracker(states);
    console.error(`Parsed ${apps.length} data rows from ${MD_PATH}`);
    const issues = reportDiagnostics(diag);
    console.error('(--check — no index written)');
    process.exit(issues > 0 ? 1 : 0);
  }

  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const { apps, diag } = syncIndex(db, states);
  console.error(`Indexed ${apps.length} applications from ${MD_PATH} into ${DB_PATH}`);
  reportDiagnostics(diag);
}

// query/history must never serve stale reads: if the markdown changed since
// the last sync (or was never synced), rebuild the index first.
function ensureFresh(db, states) {
  if (!existsSync(MD_PATH)) {
    console.error(`Error: ${MD_PATH} not found — the index has no source of truth to read from.`);
    process.exit(1);
  }
  const synced = db.prepare('SELECT value FROM meta WHERE key = ?').get('md_sha256');
  if (synced && synced.value === mdHash()) return;
  console.error(`(index stale — resyncing from ${MD_PATH})`);
  syncIndex(db, states);
}

// ── Query helpers ───────────────────────────────────────────────────

function flagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined && !args[idx + 1].startsWith('--')) return args[idx + 1];
  const kv = args.find(a => a.startsWith(flag + '='));
  return kv ? kv.split('=').slice(1).join('=') : null;
}

function rowToMarkdown(r, colmap = CANONICAL_COLMAP) {
  const clean = (v) => String(v ?? '').replace(/\|/g, '│').replace(/\r?\n/g, ' ');
  const width = Math.max(...Object.values(colmap));
  const parts = Array(width + 1).fill('');
  const set = (key, value) => { if (colmap[key] != null) parts[colmap[key]] = clean(value); };
  set('num', r.displayId ?? r.id ?? r.num);
  set('date', r.date);
  set('company', r.company);
  set('role', r.role);
  set('location', r.location || '—');
  set('score', r.score);
  set('status', r.status);
  set('decision', r.decision);
  set('rank', r.rank);
  set('confidence', r.confidence);
  set('origin', r.origin);
  set('pdf', r.pdf);
  set('report', r.report);
  set('notes', r.notes);
  return `| ${parts.slice(1).join(' | ')} |`;
}

async function query(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const states = loadStates();
  ensureFresh(db, states);

  const where = [];
  const params = [];
  const status = flagValue(args, '--status');
  if (status) {
    const canonical = normalizeStatus(status, states);
    if (!canonical) { console.error(`Error: unknown status "${status}". Canonical: ${states.labels.join(', ')}`); process.exit(1); }
    where.push('status = ?'); params.push(canonical);
  }
  const company = flagValue(args, '--company');
  if (company) { where.push('company LIKE ?'); params.push(`%${company}%`); }
  const role = flagValue(args, '--role');
  if (role) { where.push('role LIKE ?'); params.push(`%${role}%`); }
  const decision = flagValue(args, '--decision');
  if (decision) {
    const normalized = normalizeDecision(decision);
    if (normalized === 'pending' && String(decision).trim().toLowerCase() !== 'pending') {
      console.error('Error: --decision must be pending, apply, watch, or skip'); process.exit(1);
    }
    where.push('decision = ?'); params.push(normalized);
  }
  const origin = flagValue(args, '--origin');
  if (origin) {
    const normalized = normalizeOrigin(origin);
    if (normalized === 'legacy_unknown' && !['legacy_unknown', 'unknown'].includes(String(origin).trim().toLowerCase())) {
      console.error('Error: --origin must be current, legacy_import, mail_import, or legacy_unknown'); process.exit(1);
    }
    where.push('origin = ?'); params.push(normalized);
  }
  const since = flagValue(args, '--since');
  if (since) {
    if (!DATE_RE.test(since)) { console.error('Error: --since must be YYYY-MM-DD'); process.exit(1); }
    where.push('date >= ?'); params.push(since);
  }
  const id = flagValue(args, '--id');
  if (id) { where.push('id = ?'); params.push(parseInt(id, 10)); }

  let sql = 'SELECT id, date, company, role, score, status, decision, rank, confidence, origin, pdf, report, notes FROM applications'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC';
  const limit = parseInt(flagValue(args, '--limit') || '0', 10);
  if (limit > 0) { sql += ' LIMIT ?'; params.push(limit); }

  const rows = db.prepare(sql).all(...params);
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(HEADER);
    console.log(SEPARATOR);
    for (const r of rows) console.log(rowToMarkdown(r));
    console.error(`\n${rows.length} row(s)`); // stderr so stdout stays pipeable
  }
}

async function history(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  ensureFresh(db, loadStates());
  const id = parseInt(flagValue(args, '--id') || '', 10);
  if (!Number.isInteger(id)) { console.error('Error: history requires --id N'); process.exit(1); }
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!app) { console.error(`Error: no application with id ${id}`); process.exit(1); }
  console.log(`#${app.id} ${app.company} — ${app.role}`);
  for (const e of db.prepare('SELECT status, date FROM status_events WHERE app_id = ? ORDER BY id').all(id)) {
    console.log(`  ${e.date}  ${e.status}`);
  }
}

// ── Export (index → canonical markdown) ─────────────────────────────
// The inverse of sync: regenerates the canonical table from the index. Used by
// the round-trip tests (md → db → md must be lossless for clean input), and as
// a repaired copy the user can review and adopt by hand. It never touches
// applications.md unless explicitly asked to via --out.

async function exportMd(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  ensureFresh(db, loadStates());
  const rows = db.prepare('SELECT * FROM applications ORDER BY pos').all();
  const sourceLines = existsSync(MD_PATH) ? readFileSync(MD_PATH, 'utf-8').split('\n') : [];
  const sourceColmap = detectColumns(sourceLines) || CANONICAL_COLMAP;
  const sourceHeaderIndex = sourceLines.findIndex((line) => detectColumns([line]));
  const sourceHeader = sourceHeaderIndex >= 0 ? sourceLines[sourceHeaderIndex] : HEADER;
  const sourceSeparator = sourceHeaderIndex >= 0 && /^\|[-:| ]+\|?$/.test(sourceLines[sourceHeaderIndex + 1] || '')
    ? sourceLines[sourceHeaderIndex + 1]
    : SEPARATOR;
  const displayIdById = new Map();
  for (const line of sourceLines) {
    const parsed = parseTrackerRow(line, sourceColmap);
    if (parsed) displayIdById.set(parsed.num, line.split('|')[sourceColmap.num]?.trim() || String(parsed.num));
  }
  const out = [
    '# Applications Tracker',
    '',
    sourceHeader,
    sourceSeparator,
    ...rows.map((row) => rowToMarkdown({ ...row, displayId: displayIdById.get(row.id) }, sourceColmap)),
    '',
  ].join('\n');

  const outPath = flagValue(args, '--out');
  if (!outPath) {
    process.stdout.write(out);
    return;
  }
  if (existsSync(outPath) && statSync(outPath).isDirectory()) {
    console.error(`Error: --out ${outPath} is a directory — pass a file path.`);
    process.exit(1);
  }
  mkdirSync(dirname(outPath) || '.', { recursive: true });
  // Never silently clobber — whatever was there is backed up first.
  if (existsSync(outPath)) {
    copyFileSync(outPath, outPath + '.bak');
    console.error(`Existing ${outPath} backed up to ${outPath}.bak`);
  }
  writeFileSync(outPath, out, 'utf-8');
  console.error(`Exported ${rows.length} applications to ${outPath}`);
}

// ── Main ────────────────────────────────────────────────────────────

// Atomic file replace via a same-directory temp file + rename, so a reader never
// sees a partially written applications.md (mirrors merge-tracker's writer).
function writeFileAtomic(filePath, content) {
  const tmp = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, content);
    renameSync(tmp, filePath);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

// `delete --num N` removes one application row from applications.md and rebuilds
// the derived index. The markdown stays the source of truth: callers (incl. the
// web) orchestrate this script rather than editing applications.md directly, so
// the write-gate holds. The write is atomic; callers should still avoid running
// a delete concurrently with a scan-merge (they share the same file — serialize
// at the orchestration layer; a shared lock is a follow-up once merge-tracker is
// import-safe).
async function deleteApp(args) {
  const num = flagValue(args, '--num');
  if (!num) {
    console.error('Usage: node tracker.mjs delete --num <N> [--dry-run]   (remove one application row by its number)');
    process.exit(1);
  }
  if (!existsSync(MD_PATH)) {
    console.error(`Error: ${MD_PATH} not found — nothing to delete.`);
    process.exit(1);
  }
  const { removed, removedCount, report, newContent } = removeRowByNum(readFileSync(MD_PATH, 'utf-8'), num);
  if (!removed) {
    console.error(`No application numbered ${num} in ${MD_PATH}.`);
    process.exit(1);
  }
  if (args.includes('--dry-run')) {
    console.error(`Would remove application ${num} (${removedCount} row${removedCount > 1 ? 's' : ''}) from ${MD_PATH}.`);
    if (report) console.error(`(report file would be orphaned: ${report})`);
    return;
  }
  writeFileAtomic(MD_PATH, newContent);
  // Rebuild the derived SQLite index from the now-updated markdown.
  try {
    const states = loadStates();
    const DatabaseSync = await loadSqlite();
    const db = openDb(DatabaseSync);
    syncIndex(db, states);
  } catch (e) {
    console.error(`(row removed; index resync skipped: ${e.message})`);
  }
  console.error(`Removed application ${num} (${removedCount} row${removedCount > 1 ? 's' : ''}) from ${MD_PATH} and reindexed.`);
  if (report) console.error(`Note: report file may now be orphaned — ${report}`);
}

async function setStatus(args) {
  const num = flagValue(args, '--num');
  const requestedStatus = flagValue(args, '--status');
  if (!num || !requestedStatus) {
    console.error('Usage: node tracker.mjs status --num <N> --status <canonical status> [--company <company> --title <role>] [--dry-run]');
    process.exit(1);
  }
  if (!existsSync(MD_PATH)) {
    console.error(`Error: ${MD_PATH} not found — no application status can be updated.`);
    process.exit(1);
  }

  const states = loadStates();
  const canonicalStatus = normalizeStatus(requestedStatus, states);
  if (!canonicalStatus) {
    console.error(`Error: unknown status "${requestedStatus}". Valid statuses: ${states.labels.join(', ')}`);
    process.exit(1);
  }
  const original = readFileSync(MD_PATH, 'utf-8');
  const result = updateStatusByNum(original, num, canonicalStatus, {
    company: flagValue(args, '--company') || '',
    title: flagValue(args, '--title') || '',
  });
  const printable = { ...result };
  delete printable.newContent;
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ...printable, dryRun: true }));
    return;
  }

  if (result.changed) writeFileAtomic(MD_PATH, result.newContent);
  try {
    const DatabaseSync = await loadSqlite();
    const db = openDb(DatabaseSync);
    syncIndex(db, states);
  } catch (error) {
    if (result.changed) writeFileAtomic(MD_PATH, original);
    throw new Error(`Tracker status update was rolled back because reindexing failed: ${error.message}`);
  }
  console.log(JSON.stringify(printable));
}

function parseIdSelection(raw, flag) {
  const ids = new Set();
  if (!raw) return ids;
  for (const token of String(raw).split(',').map((part) => part.trim()).filter(Boolean)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start <= 0 || end < start || end - start > 10000) {
        console.error(`Error: invalid ${flag} range "${token}"`); process.exit(1);
      }
      for (let id = start; id <= end; id++) ids.add(id);
      continue;
    }
    if (!/^\d+$/.test(token) || Number(token) <= 0) {
      console.error(`Error: ${flag} accepts comma-separated IDs or ranges, for example 1-5,9`); process.exit(1);
    }
    ids.add(Number(token));
  }
  return ids;
}

function markdownCells(line) {
  const cells = String(line).trim().split('|').map((value) => value.trim());
  if (cells[0] === '') cells.shift();
  if (cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function markdownRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

/**
 * Add the review metadata contract without guessing which old rows belong to
 * the current run. Existing semantic decisions and origins are preserved;
 * missing ranks/confidence become unranked/unknown rather than inferred from a
 * legacy score.
 */
async function migrateMetadata(args) {
  if (!existsSync(MD_PATH)) {
    console.error(`Error: ${MD_PATH} not found — nothing to migrate.`); process.exit(1);
  }
  const currentIds = parseIdSelection(flagValue(args, '--current-ids'), '--current-ids');
  const legacyIds = parseIdSelection(flagValue(args, '--legacy-ids'), '--legacy-ids');
  for (const id of currentIds) {
    if (legacyIds.has(id)) { console.error(`Error: row ${id} cannot be both current and legacy.`); process.exit(1); }
  }

  const original = readFileSync(MD_PATH, 'utf-8');
  const lines = original.split('\n');
  const oldColmap = detectColumns(lines);
  if (!oldColmap) { console.error(`Error: ${MD_PATH} has no recognizable tracker header.`); process.exit(1); }
  const headerIndex = lines.findIndex((line) => detectColumns([line]));
  const parsedRows = new Map();
  for (let index = 0; index < lines.length; index++) {
    const row = parseTrackerRow(lines[index], oldColmap);
    if (row) parsedRows.set(index, row);
  }
  const knownIds = new Set([...parsedRows.values()].map((row) => row.num));
  for (const id of [...currentIds, ...legacyIds]) {
    if (!knownIds.has(id)) { console.error(`Error: tracker row ${id} does not exist.`); process.exit(1); }
  }

  const headerCells = markdownCells(lines[headerIndex]);
  const separatorCells = markdownCells(lines[headerIndex + 1] || '');
  if (headerCells.findIndex((value) => value.trim().toLowerCase() === 'status') < 0) {
    console.error('Error: tracker header has no Status column.'); process.exit(1);
  }

  const valueFor = (field, row) => {
    if (field === 'decision') return normalizeDecision(row.decision, row);
    if (field === 'rank') return normalizeRank(row.rank);
    if (field === 'confidence') return normalizeConfidence(row.confidence);
    if (currentIds.has(row.num)) return 'current';
    if (legacyIds.has(row.num)) return 'legacy_import';
    return normalizeOrigin(row.origin, { hasOriginColumn: oldColmap.origin != null });
  };
  const addColumn = (label, field, afterLabel, separator) => {
    if (headerCells.some((value) => value.trim().toLowerCase() === field)) return;
    const afterIndex = headerCells.findIndex((value) => value.trim().toLowerCase() === afterLabel);
    if (afterIndex < 0) { console.error(`Error: cannot place ${label}; ${afterLabel} column is missing.`); process.exit(1); }
    headerCells.splice(afterIndex + 1, 0, label);
    if (separatorCells.length > 0) separatorCells.splice(afterIndex + 1, 0, separator);
    for (const [index, row] of parsedRows) {
      const cells = markdownCells(lines[index]);
      cells.splice(afterIndex + 1, 0, valueFor(field, row));
      lines[index] = markdownRow(cells);
    }
  };

  addColumn('Decision', 'decision', 'status', '----------');
  addColumn('Rank', 'rank', 'decision', '------');
  addColumn('Confidence', 'confidence', 'rank', '------------');
  addColumn('Origin', 'origin', 'confidence', '--------');
  lines[headerIndex] = markdownRow(headerCells);
  if (separatorCells.length > 0) lines[headerIndex + 1] = markdownRow(separatorCells);

  const finalColmap = detectColumns(lines);
  for (const [index, originalRow] of parsedRows) {
    const cells = markdownCells(lines[index]);
    const currentRow = parseTrackerRow(lines[index], finalColmap) || originalRow;
    cells[finalColmap.decision - 1] = normalizeDecision(currentRow.decision, currentRow);
    cells[finalColmap.rank - 1] = normalizeRank(currentRow.rank);
    cells[finalColmap.confidence - 1] = normalizeConfidence(currentRow.confidence);
    if (currentIds.has(originalRow.num)) cells[finalColmap.origin - 1] = 'current';
    else if (legacyIds.has(originalRow.num)) cells[finalColmap.origin - 1] = 'legacy_import';
    else cells[finalColmap.origin - 1] = normalizeOrigin(currentRow.origin);
    lines[index] = markdownRow(cells);
  }

  const migrated = lines.join('\n');
  const afterColmap = detectColumns(lines);
  const afterRows = lines.map((line) => parseTrackerRow(line, afterColmap)).filter(Boolean);
  const counts = afterRows.reduce((acc, row) => {
    acc[row.origin] = (acc[row.origin] || 0) + 1;
    return acc;
  }, {});
  console.error(`Metadata migration: ${afterRows.length} row(s); ${counts.current || 0} current, ${counts.legacy_import || 0} imported, ${counts.legacy_unknown || 0} unclassified history.`);
  if (!args.includes('--write')) {
    console.error('(dry run — add --write to back up and update the tracker)');
    return;
  }
  if (migrated === original) { console.error('No metadata changes needed.'); return; }
  copyFileSync(MD_PATH, MD_PATH + '.metadata.bak');
  writeFileAtomic(MD_PATH, migrated);
  console.error(`Updated ${MD_PATH}; backup: ${MD_PATH}.metadata.bak`);
}

const COMMANDS = { sync, query, history, export: exportMd, delete: deleteApp, status: setStatus, 'migrate-metadata': migrateMetadata };

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const fn = COMMANDS[command];
  if (!fn) {
    console.log('Usage: node tracker.mjs <sync|query|history|export|delete|status|migrate-metadata> [flags]');
    console.log('See the header comment of this file for examples, or docs/SCRIPTS.md.');
    process.exit(command ? 1 : 0);
  }
  await fn(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
