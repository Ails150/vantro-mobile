#!/usr/bin/env node
// Repairs UTF-8 bytes that were decoded as Windows-1252 (mojibake).
// Works per-match, so one odd byte elsewhere does not block the file.
// Source is pure ASCII so it cannot corrupt itself.
//
//   node scripts/fix-mojibake.mjs           dry run
//   node scripts/fix-mojibake.mjs --write   apply

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);
const SKIP = new Set(['node_modules', '.git', '.expo', 'android', 'ios', 'dist', 'build', 'scripts']);

// CP1252 bytes 0x80-0x9F do not map to their Unicode code points.
const CP1252 = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
  0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
  0x9E: 0x017E, 0x9F: 0x0178,
};
const TO_BYTE = new Map();
for (let b = 0; b < 256; b++) TO_BYTE.set(CP1252[b] !== undefined ? CP1252[b] : b, b);

const HIGH = [];
for (const cp of TO_BYTE.keys()) if (cp >= 0x80) HIGH.push(cp);
const CLASS = HIGH.map((cp) => '\\u' + cp.toString(16).padStart(4, '0')).join('');
const LEAD = [];
for (let b = 0xC2; b <= 0xF4; b++) LEAD.push(b);
const LEAD_CLASS = LEAD.map((b) => {
  const cp = CP1252[b] !== undefined ? CP1252[b] : b;
  return '\\u' + cp.toString(16).padStart(4, '0');
}).join('');
const RUN = new RegExp('[' + LEAD_CLASS + '][' + CLASS + ']{1,3}', 'g');

// Typographic characters that should not be in source. House style: no dashes.
const PLAIN = [
  ['\u2014', ','], ['\u2013', ','], ['\u2026', '...'],
  ['\u2018', "'"], ['\u2019', "'"], ['\u201C', '"'], ['\u201D', '"'],
  ['\u00A0', ' '],
];

function repair(run) {
  const bytes = [];
  for (const ch of run) {
    const b = TO_BYTE.get(ch.codePointAt(0));
    if (b === undefined) return null;
    bytes.push(b);
  }
  const out = Buffer.from(bytes).toString('utf8');
  if (out.includes('\uFFFD')) return null;
  if (out === run) return null;
  return out;
}

function label(s) {
  return [...s].map((c) => {
    const cp = c.codePointAt(0);
    return cp > 0x7E ? 'U+' + cp.toString(16).toUpperCase() : c;
  }).join('');
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(n))) out.push(p);
  }
  return out;
}

let files = 0, hits = 0;

for (const file of walk(ROOT)) {
  const original = readFileSync(file, 'utf8');
  const seen = new Map();

  // Pass 1: repair mojibake. Must run before punctuation normalising.
  let text = original.replace(RUN, (run) => {
    const fixed = repair(run);
    if (!fixed) return run;
    seen.set(label(run), label(fixed));
    hits++;
    return fixed;
  });

  // Pass 2: normalise typographic punctuation to plain text.
  for (const [from, to] of PLAIN) {
    if (text.includes(from)) {
      seen.set(label(from), to === ',' ? 'comma' : to);
      hits += text.split(from).length - 1;
      text = text.split(from).join(to);
    }
  }
  text = text.replace(/\s+,(?=\s)/g, ',');

  if (text !== original) {
    files++;
    console.log('\n' + relative(ROOT, file));
    for (const [from, to] of seen) console.log('    ' + from + '   ->   ' + to);
    if (WRITE) writeFileSync(file, text, 'utf8');
  }
}

if (!files) console.log('Nothing to repair.');
else if (WRITE) console.log('\nRepaired ' + hits + ' occurrence(s) in ' + files + ' file(s).\nNow run: git diff');
else console.log('\nDry run. ' + hits + ' occurrence(s) in ' + files + ' file(s).\nRe-run with --write to apply.');
