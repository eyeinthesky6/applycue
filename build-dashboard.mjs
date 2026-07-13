#!/usr/bin/env node

// Build a shareable, read-only dashboard snapshot. Live feedback and automatic
// refresh are available through `npm run dashboard`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDashboardData, renderDashboardHtml } from './dashboard-server.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outputPath = join(root, 'output', 'dashboard.html');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, renderDashboardHtml(readDashboardData(root), { staticSnapshot: true }), 'utf8');
console.log(`Built ${outputPath}`);
