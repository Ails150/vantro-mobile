#!/usr/bin/env node
// Detects and repairs UTF-8 read as Latin-1 (mojibake), BOMs, UTF-16 files,
// and flags raw emoji in source. Run from the repo root.
//
//   node scripts/fix-encoding.mjs --check
//   node scripts/fix-encoding.mjs --fix
//   node scripts/fix-encoding.mjs --fix --strip-emoji

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const MODE = process.argv.includes('--fix') ? 'fix' : 'check';
const STRIP = process.argv.includes('--strip-emoji');
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);
const SKIP = new Set(['node_modules', '.git', '.expo', 'android', 'ios', 'dist', 'build', '.next']);

const MOJIBAKE = /Ã[\x80-\xBF]|â[\x80-\x9F][\x80-\xBF]|ð\x9F|â†|â€|Â[\xA0-\xBF]/;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

const findings = [];

for (const file of walk(ROOT)) {
  const raw = readFileSync(file);
  const rel = relative(ROOT, file);
  const issues = [];
  let text = null;
  let changed = false;

  // UTF-16 LE / BE
  if (raw.length > 1 && ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff))) {
    issues.push('utf-16 encoded');
    text = raw.toString(raw[0] === 0xff ? 'utf16le' : 'utf16le');
    changed = true;
  } else {
    // UTF-8 BOM
    if (raw.length > 2 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
      issues.push('utf-8 BOM');
      text = raw.subarray(3).toString('utf8');
      changed = true;
    } else {
      text = raw.toString('utf8');
    }

    // Mojibake: bytes were UTF-8 but got decoded as Latin-1 at some point
    if (MOJIBAKE.test(text)) {
      const repaired = Buffer.from(text, 'latin1').toString('utf8');
      if (!repaired.includes('\uFFFD')) {
        issues.push('mojibake, repairable');
        text = repaired;
        changed = true;
      } else {
        issues.push('mojibake, NOT auto repairable, fix by hand');
      }
    }
  }

  const emoji = text.match(EMOJI);
  if (emoji) {
    issues.push(`raw emoji x${emoji.length}: ${[...new Set(emoji)].join(' ')}`);
    if (STRIP && MODE === 'fix') {
      text = text.replace(EMOJI, '').replace(/\s{2,}/g, ' ');
      changed = true;
    }
  }

  if (issues.length) {
    findings.push({ rel, issues });
    if (MODE === 'fix' && changed) writeFileSync(file, text, { encoding: 'utf8' });
  }
}

if (!findings.length) {
  console.log('Clean. No encoding issues, no raw emoji.');
  process.exit(0);
}

console.log(`${findings.length} file(s) flagged\n`);
for (const f of findings) {
  console.log(`  ${f.rel}`);
  for (const i of f.issues) console.log(`      ${i}`);
}

if (MODE === 'check') {
  console.log('\nRun with --fix to repair encoding.');
  console.log('Add --strip-emoji to also remove emoji, then replace each with an Ionicon.');
  process.exit(1);
}

console.log('\nRepaired and saved as UTF-8 without BOM.');
if (!STRIP) console.log('Emoji left in place. Re-run with --strip-emoji once you are ready to swap in Ionicons.');
console.log('Now run: git diff');
